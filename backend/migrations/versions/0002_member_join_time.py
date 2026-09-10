"""Preserve the boundary between historical movements and newly joined members."""

from alembic import op

revision = "0002"
down_revision = "0001"


def upgrade() -> None:
    op.execute("ALTER TABLE appachas.members ADD COLUMN joined_at timestamptz")
    op.execute("""
        UPDATE appachas.members AS member SET joined_at = groups.created_at
        FROM appachas.groups AS groups WHERE member.group_id = groups.id
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE appachas.members DROP COLUMN joined_at")
