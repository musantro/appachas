"""Short-lived browser-bound handoffs between trusted, distinct hosts."""

from alembic import op

revision = "0005"
down_revision = "0004"


def upgrade() -> None:
    op.execute("""
        CREATE TABLE appachas.session_migrations (
            id uuid PRIMARY KEY,
            group_id uuid NOT NULL REFERENCES appachas.groups(id) ON DELETE CASCADE,
            source_origin text NOT NULL,
            target_origin text NOT NULL,
            binding_hash text NOT NULL,
            created_at timestamptz NOT NULL,
            expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
            source_session_hash text REFERENCES appachas.sessions(token_hash) ON DELETE CASCADE,
            member_id uuid,
            role text CHECK (role IN ('creator', 'member')),
            code_hash text UNIQUE,
            pending_session_hash text UNIQUE,
            redeemed_at timestamptz,
            confirmed_at timestamptz,
            FOREIGN KEY (group_id, member_id)
                REFERENCES appachas.members(group_id, id) ON DELETE CASCADE,
            CHECK ((source_session_hash IS NULL AND member_id IS NULL AND role IS NULL
                    AND code_hash IS NULL) OR
                   (source_session_hash IS NOT NULL AND member_id IS NOT NULL
                    AND role IS NOT NULL AND code_hash IS NOT NULL)),
            CHECK ((pending_session_hash IS NULL AND redeemed_at IS NULL) OR
                   (pending_session_hash IS NOT NULL AND redeemed_at IS NOT NULL
                    AND code_hash IS NOT NULL)),
            CHECK (confirmed_at IS NULL OR redeemed_at IS NOT NULL)
        );
        CREATE INDEX migration_expiry ON appachas.session_migrations(expires_at);
        CREATE INDEX migration_group ON appachas.session_migrations(group_id);
        REVOKE ALL ON appachas.session_migrations FROM PUBLIC;
        ALTER TABLE appachas.session_migrations ENABLE ROW LEVEL SECURITY;
    """)


def downgrade() -> None:
    op.execute("DROP TABLE appachas.session_migrations")
