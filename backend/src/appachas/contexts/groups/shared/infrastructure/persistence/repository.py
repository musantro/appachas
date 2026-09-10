from typing import Any

from psycopg import Connection
from psycopg.rows import dict_row

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
