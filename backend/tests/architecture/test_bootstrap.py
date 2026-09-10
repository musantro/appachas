from contextlib import contextmanager
from http.cookies import SimpleCookie
from types import SimpleNamespace

import pytest
from dependency_injector import providers
from fastapi import Depends
from fastapi.testclient import TestClient

from appachas.contexts.groups.group_creation.application.handler import CreatedGroup
from appachas.contexts.groups.shared.infrastructure.http.dependencies import connection
from appachas.infrastructure.bootstrap.adapters import Settings
from appachas.infrastructure.bootstrap.container import Container
from appachas.main import create_app
from tests.mothers import FrozenClock, GroupMother

PRODUCTION_SETTINGS = Settings("unused", "cron", True, ("https://appachas.vercel.app",), 2)


class FakePool:
    def __init__(self):
        self.opened = self.closed = self.acquired = self.released = 0

    def open(self):
        self.opened += 1

    def close(self):
        self.closed += 1

    @contextmanager
    def connection(self):
        self.acquired += 1
        try:
            yield self
        finally:
            self.released += 1

    def execute(self, query):
        return self


@pytest.fixture
def fake_application(request):
    container = Container()
    pool = FakePool()
    container.pool.override(providers.Object(pool))
    settings = getattr(request, "param", Settings("unused", "cron", False, (), 2))
    container.settings.override(providers.Object(settings))
    app = create_app(container)
    yield app, pool
    container.unwire()
    container.reset_override()


def test_request_resource_returns_connection_and_lifespan_closes_pool(fake_application):
    # Arrange / Given
    app, pool = fake_application
    # Act / When
    with TestClient(app) as client:
        response = client.get("/api/health")
    # Assert / Then
    assert response.status_code == 200
    assert (pool.opened, pool.closed, pool.acquired, pool.released) == (1, 1, 1, 1)


def test_failure_returns_request_resource_and_never_logs_private_exception(
    fake_application, caplog
):
    # Arrange / Given
    app, pool = fake_application

    @app.get("/api/failure")
    def failure(current=Depends(connection)):
        raise RuntimeError("private-alias private-token secret-SQL")

    # Act / When
    with TestClient(app) as client:
        response = client.get("/api/failure")
    # Assert / Then
    assert response.status_code == 500
    assert pool.released == pool.acquired == 1
    assert "private" not in response.text
    assert "private" not in caplog.text
    assert "secret-SQL" not in caplog.text


def test_cross_origin_mutation_rejected_before_acquiring_connection(fake_application):
    # Arrange / Given
    app, pool = fake_application
    # Act / When
    with TestClient(app) as client:
        response = client.post("/api/groups", json={}, headers={"Origin": "https://evil.example"})
    # Assert / Then
    assert response.status_code == 403
    assert response.json()["code"] == "origin_forbidden"
    assert pool.acquired == 0


def test_creation_rate_limit_returns_problem_details(fake_application):
    # Arrange / Given
    app, _ = fake_application
    with TestClient(app) as client:
        for _ in range(2):
            client.post("/api/groups", json={}, headers={"Origin": "http://testserver"})
        # Act / When
        response = client.post("/api/groups", json={}, headers={"Origin": "http://testserver"})
    # Assert / Then
    assert response.status_code == 429
    assert response.json()["code"] == "rate_limited"


@pytest.mark.parametrize("fake_application", [PRODUCTION_SETTINGS], indirect=True)
@pytest.mark.parametrize(
    "base_url,headers,status",
    [
        ("https://appachas.es", {"Origin": "https://appachas.es"}, 200),
        ("https://appachas.vercel.app", {"Origin": "https://appachas.vercel.app"}, 200),
        (
            "https://internal.vercel",
            {"Origin": "https://appachas.es", "X-Forwarded-Host": "appachas.es"},
            200,
        ),
        ("https://appachas.es", {"Referer": "https://appachas.es/g"}, 200),
        ("https://appachas.es", {"Origin": "https://unrelated.example"}, 403),
    ],
)
def test_custom_domain_origin_validation_preserves_legacy_access(
    fake_application, base_url, headers, status
):
    # Arrange / Given: the explicit origin setting still names only the legacy domain.
    app, pool = fake_application

    @app.post("/api/domain-probe")
    def probe():
        return {"ok": True}

    # Act / When
    with TestClient(app, base_url=base_url) as client:
        response = client.post("/api/domain-probe", headers=headers)

    # Assert / Then
    assert response.status_code == status
    assert pool.acquired == 0
    if status == 403:
        assert response.json()["code"] == "origin_forbidden"


@pytest.mark.parametrize("fake_application", [PRODUCTION_SETTINGS], indirect=True)
@pytest.mark.parametrize("origin", ["https://appachas.es", "https://appachas.vercel.app"])
def test_group_creation_uses_current_origin_and_host_only_secure_session_cookie(
    fake_application, origin
):
    # Arrange / Given
    app, pool = fake_application
    clock = FrozenClock()
    group = GroupMother.with_members()
    created = CreatedGroup(
        group, "creator-entry-example", "member-entry-example", "session-example"
    )
    app.state.container.create_group.override(
        providers.Factory(
            lambda uow_factory: SimpleNamespace(handle=lambda command: created, clock=clock)
        )
    )
    body = {
        "name": group.name,
        "start_date": group.start_date.isoformat(),
        "end_date": group.end_date.isoformat(),
        "timezone": group.timezone,
        "members": [member.alias for member in group.members],
        "creator_index": 0,
    }

    # Act / When
    with TestClient(app, base_url=origin) as client:
        response = client.post("/api/groups", headers={"Origin": origin}, json=body)

    # Assert / Then
    assert response.status_code == 201
    result = response.json()
    assert result["creator_url"] == f"{origin}/g#{created.creator_token}"
    assert result["member_url"] == f"{origin}/g#{created.member_token}"
    cookies = SimpleCookie(response.headers["set-cookie"])
    assert len(cookies) == 1
    cookie = cookies[f"appachas_{group.id}"]
    assert cookie["domain"] == ""
    assert cookie["path"] == "/api"
    assert cookie["secure"]
    assert cookie["httponly"]
    assert cookie["samesite"] == "strict"
    assert pool.acquired == pool.released == 1
