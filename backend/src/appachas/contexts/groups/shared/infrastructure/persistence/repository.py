from datetime import datetime
from typing import Any

from psycopg import Connection
from psycopg.rows import dict_row

from appachas.contexts.groups.shared.application.ports import Actor, Session, SessionMigration
from appachas.contexts.groups.shared.domain.models import Allocation, Group, Member, Movement


class PostgresRepository:
    def __init__(self, connection: Connection[dict[str, Any]]):
        self.connection = connection

    def get(self, token_hash: str, *, lock: bool) -> tuple[Group, bool] | None:
        lock_clause = "FOR UPDATE" if lock else "FOR SHARE"
        row = self.connection.execute(
            "SELECT * FROM appachas.groups WHERE creator_token_hash=%s OR member_token_hash=%s "
            + lock_clause,
            (token_hash, token_hash),
        ).fetchone()
        if row is None:
            return None
        return self._group(row), row["creator_token_hash"] == token_hash

    def _group(self, row) -> Group:
        member_rows = self.connection.execute(
            "SELECT * FROM appachas.members WHERE group_id=%s ORDER BY position", (row["id"],)
        ).fetchall()
        members = [
            Member(
                str(m["id"]),
                m["alias"],
                m["position"],
                m["is_creator"],
                m["session_hash"],
                m["version"],
                m["joined_at"],
            )
            for m in member_rows
        ]
        allocation_rows = self.connection.execute(
            "SELECT * FROM appachas.movement_allocations WHERE group_id=%s", (row["id"],)
        ).fetchall()
        allocations: dict[str, list[Allocation]] = {}
        for allocation in allocation_rows:
            allocations.setdefault(str(allocation["movement_id"]), []).append(
                Allocation(str(allocation["member_id"]), allocation["amount_cents"])
            )
        order = {m.id: m.position for m in members}
        movements = [
            Movement(
                str(m["id"]),
                m["type"],
                m["amount_cents"],
                m["concept"],
                m["movement_date"],
                str(m["payer_id"]),
                sorted(allocations.get(str(m["id"]), []), key=lambda a: order[a.member_id]),
                m["created_at"],
                m["updated_at"],
                m["version"],
            )
            for m in self.connection.execute(
                "SELECT * FROM appachas.movements WHERE group_id=%s "
                "ORDER BY movement_date DESC, created_at DESC, id",
                (row["id"],),
            ).fetchall()
        ]
        return Group(
            str(row["id"]),
            row["name"],
            row["start_date"],
            row["end_date"],
            row["timezone"],
            str(row["creator_member_id"]),
            row["created_at"],
            members,
            movements,
            row["last_movement_on"],
            row["version"],
        )

    def get_by_id(self, group_id: str, *, lock: bool) -> Group | None:
        lock_clause = "FOR UPDATE" if lock else "FOR SHARE"
        row = self.connection.execute(
            "SELECT * FROM appachas.groups WHERE id=%s " + lock_clause, (group_id,)
        ).fetchone()
        return self._group(row) if row else None

    def session_actor(self, group_id: str, session_hash: str) -> Actor | None:
        row = self.connection.execute(
            """SELECT session.member_id,session.role FROM appachas.sessions AS session
               JOIN appachas.members AS member ON member.id=session.member_id
               WHERE session.group_id=%s AND session.token_hash=%s AND session.revoked_at IS NULL
                 AND ((session.role='creator' AND member.is_creator)
                   OR (session.role='member' AND NOT member.is_creator
                       AND member.session_hash=session.token_hash))""",
            (group_id, session_hash),
        ).fetchone()
        return Actor(str(row["member_id"]), row["role"] == "creator") if row else None

    def save_session(self, session: Session) -> None:
        self.connection.execute(
            """INSERT INTO appachas.sessions
               (token_hash,group_id,member_id,role,created_at,revoked_at)
               VALUES (%s,%s,%s,%s,%s,%s)""",
            (
                session.token_hash,
                session.group_id,
                session.member_id,
                "creator" if session.is_creator else "member",
                session.created_at,
                session.revoked_at,
            ),
        )

    def revoke_member_sessions(self, member_id: str, revoked_at: datetime) -> None:
        self.connection.execute(
            """UPDATE appachas.sessions SET revoked_at=%s
               WHERE member_id=%s AND role='member' AND revoked_at IS NULL""",
            (revoked_at, member_id),
        )

    def revoke_session(self, session_hash: str, revoked_at: datetime) -> None:
        self.connection.execute(
            "UPDATE appachas.sessions SET revoked_at=%s WHERE token_hash=%s AND revoked_at IS NULL",
            (revoked_at, session_hash),
        )

    def get_migration(self, group_id: str, migration_id: str) -> SessionMigration | None:
        row = self.connection.execute(
            "SELECT * FROM appachas.session_migrations WHERE group_id=%s AND id=%s FOR UPDATE",
            (group_id, migration_id),
        ).fetchone()
        if row is None:
            return None
        return SessionMigration(
            str(row["id"]),
            str(row["group_id"]),
            row["source_origin"],
            row["target_origin"],
            row["binding_hash"],
            row["created_at"],
            row["expires_at"],
            row["source_session_hash"],
            str(row["member_id"]) if row["member_id"] is not None else None,
            row["role"] == "creator" if row["role"] is not None else None,
            row["code_hash"],
            row["pending_session_hash"],
            row["redeemed_at"],
            row["confirmed_at"],
        )

    def save_migration(self, migration: SessionMigration) -> None:
        self.connection.execute(
            """INSERT INTO appachas.session_migrations
               (id,group_id,source_origin,target_origin,binding_hash,created_at,expires_at,
                source_session_hash,member_id,role,code_hash,pending_session_hash,
                redeemed_at,confirmed_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT (id) DO UPDATE SET source_session_hash=EXCLUDED.source_session_hash,
                 member_id=EXCLUDED.member_id,role=EXCLUDED.role,code_hash=EXCLUDED.code_hash,
                 pending_session_hash=EXCLUDED.pending_session_hash,
                 redeemed_at=EXCLUDED.redeemed_at,confirmed_at=EXCLUDED.confirmed_at""",
            (
                migration.id,
                migration.group_id,
                migration.source_origin,
                migration.target_origin,
                migration.binding_hash,
                migration.created_at,
                migration.expires_at,
                migration.source_session_hash,
                migration.member_id,
                None
                if migration.is_creator is None
                else "creator"
                if migration.is_creator
                else "member",
                migration.code_hash,
                migration.pending_session_hash,
                migration.redeemed_at,
                migration.confirmed_at,
            ),
        )

    def purge_migrations(self, now: datetime, group_id: str | None = None) -> None:
        # Skip rows another request holds, preserving the group→migration lock
        # order even when the scheduled cleanup scans multiple groups.
        self.connection.execute(
            """DELETE FROM appachas.session_migrations WHERE id IN (
                 SELECT id FROM appachas.session_migrations
                 WHERE expires_at<=%s AND (%s::uuid IS NULL OR group_id=%s::uuid)
                 FOR UPDATE SKIP LOCKED)""",
            (now, group_id, group_id),
        )

    def count_migrations(self, group_id: str) -> int:
        row = self.connection.execute(
            "SELECT COUNT(*) AS total FROM appachas.session_migrations WHERE group_id=%s",
            (group_id,),
        ).fetchone()
        assert row is not None
        return row["total"]

    def create(self, group: Group, creator_hash: str, member_hash: str) -> None:
        self.connection.execute(
            """INSERT INTO appachas.groups
               (id,name,creator_token_hash,member_token_hash,creator_member_id,start_date,end_date,timezone,created_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            (
                group.id,
                group.name,
                creator_hash,
                member_hash,
                group.creator_member_id,
                group.start_date,
                group.end_date,
                group.timezone,
                group.created_at,
            ),
        )
        for member in group.members:
            self.save_member(group.id, member)

    def save_group(self, group: Group) -> None:
        self.connection.execute(
            """UPDATE appachas.groups SET name=%s,start_date=%s,end_date=%s,last_movement_on=%s,
               version=%s WHERE id=%s""",
            (
                group.name,
                group.start_date,
                group.end_date,
                group.last_movement_on,
                group.version,
                group.id,
            ),
        )

    def save_member(self, group_id: str, member: Member) -> None:
        self.connection.execute(
            """INSERT INTO appachas.members
               (id,group_id,alias,alias_key,position,is_creator,session_hash,version,joined_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO UPDATE
               SET alias=EXCLUDED.alias,alias_key=EXCLUDED.alias_key,
                   session_hash=EXCLUDED.session_hash,version=EXCLUDED.version""",
            (
                member.id,
                group_id,
                member.alias,
                member.alias.casefold(),
                member.position,
                member.is_creator,
                member.session_hash,
                member.version,
                member.joined_at,
            ),
        )

    def delete_member(self, member_id: str) -> None:
        self.connection.execute("DELETE FROM appachas.members WHERE id=%s", (member_id,))

    def save_movement(self, group_id: str, movement: Movement) -> None:
        self.connection.execute(
            """INSERT INTO appachas.movements
               (id,group_id,type,amount_cents,concept,movement_date,payer_id,created_at,updated_at,version)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO UPDATE
               SET type=EXCLUDED.type,amount_cents=EXCLUDED.amount_cents,concept=EXCLUDED.concept,
                   movement_date=EXCLUDED.movement_date,payer_id=EXCLUDED.payer_id,
                   updated_at=EXCLUDED.updated_at,version=EXCLUDED.version""",
            (
                movement.id,
                group_id,
                movement.type,
                movement.amount_cents,
                movement.concept,
                movement.date,
                movement.payer_id,
                movement.created_at,
                movement.updated_at,
                movement.version,
            ),
        )
        self.connection.execute(
            "DELETE FROM appachas.movement_allocations WHERE movement_id=%s", (movement.id,)
        )
        with self.connection.cursor() as cursor:
            cursor.executemany(
                "INSERT INTO appachas.movement_allocations "
                "(movement_id,group_id,member_id,amount_cents) VALUES (%s,%s,%s,%s)",
                [
                    (movement.id, group_id, a.member_id, a.amount_cents)
                    for a in movement.allocations
                ],
            )

    def delete_movement(self, movement_id: str) -> None:
        self.connection.execute("DELETE FROM appachas.movements WHERE id=%s", (movement_id,))

    def delete_group(self, group_id: str) -> None:
        self.connection.execute(
            "DELETE FROM appachas.movement_allocations WHERE group_id=%s", (group_id,)
        )
        self.connection.execute("DELETE FROM appachas.movements WHERE group_id=%s", (group_id,))
        self.connection.execute("DELETE FROM appachas.groups WHERE id=%s", (group_id,))

    def expiry_candidates(self) -> list[Group]:
        rows = self.connection.execute(
            "SELECT * FROM appachas.groups WHERE end_date < CURRENT_DATE FOR UPDATE SKIP LOCKED"
        ).fetchall()
        return [self._group(row) for row in rows]


class PostgresUnitOfWork:
    def __init__(self, connection: Connection[dict[str, Any]]):
        self.connection = connection
        self.connection.row_factory = dict_row
        self.repository = PostgresRepository(connection)

    def __enter__(self):
        self.transaction = self.connection.transaction()
        self.transaction.__enter__()
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return self.transaction.__exit__(exc_type, exc_value, traceback)
