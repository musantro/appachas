from dataclasses import replace
from http.cookies import SimpleCookie
from uuid import uuid4

import pytest
from dependency_injector import providers
from fastapi.testclient import TestClient

from appachas.contexts.groups.session_migration.application.handlers import (
    AuthorizeMigrationHandler,
    ConfirmMigrationHandler,
    RedeemMigrationHandler,
    StartMigrationHandler,
)
from appachas.contexts.groups.shared.application.ports import Session
from appachas.contexts.groups.shared.infrastructure.http.dependencies import migration_cookie_name
from appachas.infrastructure.bootstrap.adapters import SecureTokens, Settings
from tests.architecture.test_bootstrap import PRODUCTION_SETTINGS
from tests.architecture.test_bootstrap import fake_application as fake_application
from tests.mothers import FrozenClock, GroupMother, MemoryRepository

SOURCE = "https://appachas.vercel.app"
TARGET = "https://appachas.es"


@pytest.mark.parametrize(
    "source,target,environment",
    [
        (SOURCE, SOURCE, "production"),
        ("https://appachas.es:444", TARGET, "production"),
        ("http://localhost:4173", "http://localhost:5173", "test"),
        ("http://127.0.0.1:4173", "http://localhost:4173", "production"),
        ("http://untrusted.example", TARGET, "development"),
        (SOURCE + "/callback", TARGET, "production"),
        (SOURCE + "?redirect=x", TARGET, "production"),
        (SOURCE + "#fragment", TARGET, "production"),
        ("https://user@appachas.vercel.app", TARGET, "production"),
    ],
)
def test_migration_configuration_rejects_unsafe_or_same_cookie_host_origins(
    source, target, environment
):
    # Arrange / Given / Act / When
    with pytest.raises(ValueError):
        Settings(
            "unused",
            "cron",
            True,
            (),
            migration_source_origin=source,
            migration_target_origin=target,
            app_env=environment,
        )
    # Assert / Then: invalid origins cannot configure the application.


@pytest.mark.parametrize("environment", ["test", "development"])
def test_explicit_local_migration_uses_distinct_cookie_hosts(environment):
    # Arrange / Given / Act / When
    settings = Settings(
        "unused",
        "cron",
        False,
        (),
        migration_source_origin="http://127.0.0.1:4173",
        migration_target_origin="http://localhost:4173",
        app_env=environment,
    )
    # Assert / Then
    assert settings.migration_source_origin != settings.migration_target_origin


@pytest.mark.parametrize("fake_application", [PRODUCTION_SETTINGS], indirect=True)
@pytest.mark.parametrize("phase", ["start", "authorize", "redeem", "confirm"])
@pytest.mark.parametrize(
    "problem", ["wrong_origin", "wrong_host", "referer_only", "forwarded_host"]
)
def test_migration_requires_its_exact_phase_origin_and_host_before_database_access(
    fake_application, phase, problem
):
    # Arrange / Given
    app, pool = fake_application
    expected = SOURCE if phase == "authorize" else TARGET
    other = TARGET if phase == "authorize" else SOURCE
    host = expected
    headers = {"Origin": expected, "X-Appachas-Group": str(uuid4())}
    if problem == "wrong_origin":
        headers["Origin"] = other
    elif problem == "wrong_host":
        host = other
    elif problem == "referer_only":
        headers.pop("Origin")
        headers["Referer"] = expected + "/migration"
    else:
        host = "https://untrusted.example"
        headers["X-Forwarded-Host"] = expected.removeprefix("https://")
    body = {} if phase == "start" else {"id": str(uuid4())}
    if phase == "redeem":
        body["code"] = "A" * 43

    # Act / When
    with TestClient(app, base_url=host) as client:
        response = client.post(f"/api/group/migration/{phase}", headers=headers, json=body)

    # Assert / Then
    assert response.status_code == 403
    assert pool.acquired == 0


@pytest.mark.parametrize("fake_application", [PRODUCTION_SETTINGS], indirect=True)
@pytest.mark.parametrize("creator", [False, True])
def test_http_migration_sets_secure_host_only_cookies_and_keeps_pending_session_unauthorized(
    fake_application, creator
):
    # Arrange / Given
    app, _ = fake_application
    group = GroupMother.with_members()
    clock = FrozenClock()
    tokens = SecureTokens()
    source_raw, source_hash = tokens.generate()
    member = group.members[0 if creator else 1]
    if not creator:
        member.session_hash = source_hash
    repository = MemoryRepository(group)
    repository.save_session(Session(source_hash, group.id, member.id, creator, clock.now()))
    for name, cls in (
        ("start_migration", StartMigrationHandler),
        ("authorize_migration", AuthorizeMigrationHandler),
        ("redeem_migration", RedeemMigrationHandler),
        ("confirm_migration", ConfirmMigrationHandler),
    ):
        getattr(app.state.container, name).override(
            providers.Factory(
                lambda uow_factory, operation=cls: operation(
                    repository.unit_of_work, clock, tokens, SOURCE, TARGET
                )
            )
        )
    cookie_name = f"appachas_{group.id}"
    headers = {"Origin": TARGET, "X-Appachas-Group": group.id}
    with TestClient(app, base_url=TARGET) as client:
        client.cookies.set(cookie_name, source_raw, domain="appachas.vercel.app", path="/api")

        # Act / When
        started = client.post("/api/group/migration/start", headers=headers, json={})
        assert started.status_code == 200
        identifier = started.json()["id"]
        assert set(started.json()) == {"id"}
        binding_cookie = SimpleCookie(started.headers["set-cookie"])[
            migration_cookie_name(identifier)
        ]
        authorized = client.post(
            SOURCE + "/api/group/migration/authorize",
            headers={**headers, "Origin": SOURCE},
            json={"id": identifier},
        )
        assert authorized.status_code == 200
        assert set(authorized.json()) == {"code"}
        redeemed = client.post(
            "/api/group/migration/redeem",
            headers=headers,
            json={"id": identifier, "code": authorized.json()["code"]},
        )
        assert redeemed.status_code == 204
        pending_cookie = SimpleCookie(redeemed.headers["set-cookie"])[cookie_name]
        pending_hash = repository.migrations[identifier].pending_session_hash
        assert pending_hash is not None
        assert repository.session_actor(group.id, pending_hash) is None
        assert repository.session_actor(group.id, source_hash) is not None
        confirmed = client.post(
            "/api/group/migration/confirm", headers=headers, json={"id": identifier}
        )

    # Assert / Then
    assert confirmed.status_code == 200
    assert confirmed.json()["group"]["my_member_id"] == member.id
    assert confirmed.json()["group"]["role"] == ("creator" if creator else "member")
    assert repository.session_actor(group.id, source_hash) is None
    assert repository.session_actor(group.id, pending_hash).member_id == member.id
    for cookie, path in ((binding_cookie, "/api/group/migration"), (pending_cookie, "/api")):
        assert cookie["domain"] == ""
        assert cookie["path"] == path
        assert cookie["httponly"] and cookie["secure"]
        assert cookie["samesite"] == "strict"
    assert binding_cookie["max-age"] == "120"
    cleared = SimpleCookie(confirmed.headers["set-cookie"])[migration_cookie_name(identifier)]
    assert cleared["max-age"] == "0"
    assert confirmed.headers["Cache-Control"] == "no-store"
    assert confirmed.headers["Referrer-Policy"] == "no-referrer"


def test_migration_environment_overrides_are_explicit(monkeypatch):
    # Arrange / Given
    monkeypatch.setenv("MIGRATION_SOURCE_ORIGIN", "http://127.0.0.1:4173")
    monkeypatch.setenv("MIGRATION_TARGET_ORIGIN", "http://localhost:4173")
    monkeypatch.setenv("APP_ENV", "test")
    # Act / When
    settings = Settings.from_env()
    # Assert / Then
    assert settings.migration_source_origin == "http://127.0.0.1:4173"
    assert settings.migration_target_origin == "http://localhost:4173"
    with pytest.raises(ValueError):
        replace(settings, app_env="production")
