"""Opaque, revocable sessions independent of the initial secret links."""

from alembic import op

revision = "0003"
down_revision = "0002"


def upgrade() -> None:
    op.execute("""
        CREATE TABLE appachas.sessions (
            token_hash text PRIMARY KEY,
            group_id uuid NOT NULL REFERENCES appachas.groups(id) ON DELETE CASCADE,
            member_id uuid NOT NULL,
            role text NOT NULL CHECK (role IN ('creator', 'member')),
            created_at timestamptz NOT NULL,
            revoked_at timestamptz,
            FOREIGN KEY (group_id, member_id)
                REFERENCES appachas.members(group_id, id) ON DELETE CASCADE
        );
        CREATE UNIQUE INDEX active_member_session
            ON appachas.sessions(group_id, member_id)
            WHERE revoked_at IS NULL AND role = 'member';
        CREATE INDEX session_member ON appachas.sessions(member_id);
        INSERT INTO appachas.sessions (token_hash,group_id,member_id,role,created_at)
            SELECT member.session_hash,member.group_id,member.id,'member',
                   COALESCE(member.joined_at,groups.created_at)
            FROM appachas.members AS member
            JOIN appachas.groups AS groups ON groups.id = member.group_id
            WHERE member.session_hash IS NOT NULL AND NOT member.is_creator;
        REVOKE ALL ON appachas.sessions FROM PUBLIC;
        ALTER TABLE appachas.sessions ENABLE ROW LEVEL SECURITY;
    """)


def downgrade() -> None:
    op.execute("DROP TABLE appachas.sessions")
