import secrets
from dataclasses import dataclass
from datetime import timedelta

from appachas.contexts.groups.shared.application.access import Handler, load_group, require_actor
from appachas.contexts.groups.shared.application.ports import (
    Access,
    Actor,
    Repository,
    Session,
    SessionMigration,
)
from appachas.contexts.groups.shared.domain.errors import Conflict, Forbidden, invalid
from appachas.contexts.groups.shared.domain.models import Group

MIGRATION_SECONDS = 120


def invalid_migration() -> Forbidden:
    return Forbidden("migration_invalid", "El traslado ha caducado o ya no es válido.")


def matches(expected: str | None, actual: str | None) -> bool:
    return bool(expected and actual and secrets.compare_digest(expected, actual))


@dataclass
class StartedMigration:
    id: str
    binding_token: str


@dataclass
class ConfirmedMigration:
    group: Group
    actor: Actor


class MigrationHandler(Handler):
    def __init__(self, uow_factory, clock, tokens, source_origin: str, target_origin: str):
        super().__init__(uow_factory, clock, tokens)
        self.source_origin = source_origin
        self.target_origin = target_origin

    def load(self, repository: Repository, access: Access, migration_id: str):
        # Never accept a secret entry link as evidence of a browser session.
        group, _ = load_group(repository, Access(group_id=access.group_id), self.clock, lock=True)
        migration = repository.get_migration(group.id, migration_id)
        if (
            migration is None
            or migration.expires_at <= self.clock.now()
            or migration.source_origin != self.source_origin
            or migration.target_origin != self.target_origin
        ):
            raise invalid_migration()
        return group, migration

    def source_actor(self, repository: Repository, migration: SessionMigration) -> Actor:
        actor = (
            repository.session_actor(migration.group_id, migration.source_session_hash)
            if migration.source_session_hash
            else None
        )
        if actor is None or (actor.member_id, actor.is_creator) != (
            migration.member_id,
            migration.is_creator,
        ):
            raise invalid_migration()
        return actor


class StartMigrationHandler(MigrationHandler):
    def handle(self, access: Access) -> StartedMigration:
        with self.uow_factory() as uow:
            group, _ = load_group(
                uow.repository, Access(group_id=access.group_id), self.clock, lock=True
            )
            now = self.clock.now()
            uow.repository.purge_migrations(now, group.id)
            if uow.repository.count_migrations(group.id) >= 64:
                raise invalid(
                    "migration_limit", "Hay demasiados traslados pendientes. Espera un poco."
                )
            raw, hashed = self.tokens.generate()
            migration = SessionMigration(
                self.tokens.identifier(),
                group.id,
                self.source_origin,
                self.target_origin,
                hashed,
                now,
                now + timedelta(seconds=MIGRATION_SECONDS),
            )
            uow.repository.save_migration(migration)
            return StartedMigration(migration.id, raw)


class AuthorizeMigrationHandler(MigrationHandler):
    def handle(self, access: Access, migration_id: str) -> str:
        with self.uow_factory() as uow:
            group, migration = self.load(uow.repository, access, migration_id)
            actor = require_actor(
                uow.repository.session_actor(group.id, access.session_hash)
                if access.session_hash
                else None
            )
            if migration.code_hash is not None:
                raise Conflict("migration_used", "Este traslado ya se ha autorizado.")
            raw, hashed = self.tokens.generate()
            migration.source_session_hash = access.session_hash
            migration.member_id = actor.member_id
            migration.is_creator = actor.is_creator
            migration.code_hash = hashed
            uow.repository.save_migration(migration)
            return raw


class RedeemMigrationHandler(MigrationHandler):
    def handle(
        self, access: Access, migration_id: str, binding_hash: str | None, code_hash: str
    ) -> str:
        with self.uow_factory() as uow:
            group, migration = self.load(uow.repository, access, migration_id)
            if not matches(migration.binding_hash, binding_hash) or not matches(
                migration.code_hash, code_hash
            ):
                raise invalid_migration()
            if migration.redeemed_at is not None:
                raise Conflict("migration_used", "Este traslado ya se ha canjeado.")
            self.source_actor(uow.repository, migration)
            if access.session_hash and uow.repository.session_actor(group.id, access.session_hash):
                raise Conflict(
                    "migration_target_occupied", "Este navegador ya tiene una sesión en el grupo."
                )
            raw, hashed = self.tokens.generate()
            migration.pending_session_hash = hashed
            migration.redeemed_at = self.clock.now()
            uow.repository.save_migration(migration)
            # Not an active session yet: confirmation proves that the browser
            # stored this cookie before its old session can be revoked.
            return raw


class ConfirmMigrationHandler(MigrationHandler):
    def handle(
        self, access: Access, migration_id: str, binding_hash: str | None
    ) -> ConfirmedMigration:
        with self.uow_factory() as uow:
            group, migration = self.load(uow.repository, access, migration_id)
            if not matches(migration.binding_hash, binding_hash) or not matches(
                migration.pending_session_hash, access.session_hash
            ):
                raise invalid_migration()
            assert access.session_hash is not None
            if migration.confirmed_at is not None:
                actor = uow.repository.session_actor(group.id, access.session_hash)
                if actor is None or (actor.member_id, actor.is_creator) != (
                    migration.member_id,
                    migration.is_creator,
                ):
                    raise invalid_migration()
                return ConfirmedMigration(group, actor)
            actor = self.source_actor(uow.repository, migration)
            now = self.clock.now()
            assert migration.source_session_hash is not None
            uow.repository.revoke_session(migration.source_session_hash, now)
            if not actor.is_creator:
                member = group.member(actor.member_id)
                member.session_hash = access.session_hash
                member.version += 1
                uow.repository.save_member(group.id, member)
                group.version += 1
                uow.repository.save_group(group)
            uow.repository.save_session(
                Session(access.session_hash, group.id, actor.member_id, actor.is_creator, now)
            )
            migration.confirmed_at = now
            uow.repository.save_migration(migration)
            return ConfirmedMigration(group, actor)
