"""Normalized private group storage."""

from alembic import op

revision = "0001"
down_revision = None


def upgrade() -> None:
    op.execute("""
        CREATE SCHEMA IF NOT EXISTS appachas;
        CREATE TABLE appachas.groups (
            id uuid PRIMARY KEY,
            name text NOT NULL CHECK (length(name) BETWEEN 1 AND 20),
            creator_token_hash text NOT NULL UNIQUE,
            member_token_hash text NOT NULL UNIQUE,
            creator_member_id uuid NOT NULL,
            start_date date NOT NULL,
            end_date date NOT NULL CHECK (end_date >= start_date),
            timezone text NOT NULL,
            created_at timestamptz NOT NULL,
            last_movement_on date,
            version integer NOT NULL DEFAULT 1 CHECK (version > 0)
        );
        CREATE INDEX groups_expiry ON appachas.groups (end_date);
        CREATE TABLE appachas.members (
            id uuid PRIMARY KEY,
            group_id uuid NOT NULL REFERENCES appachas.groups(id) ON DELETE CASCADE,
            alias text NOT NULL CHECK (length(alias) BETWEEN 1 AND 20),
            alias_key text NOT NULL,
            position integer NOT NULL CHECK (position >= 0),
            is_creator boolean NOT NULL DEFAULT false,
            session_hash text UNIQUE,
            version integer NOT NULL DEFAULT 1 CHECK (version > 0),
            UNIQUE (group_id, alias_key), UNIQUE (group_id, position), UNIQUE (group_id, id)
        );
        ALTER TABLE appachas.groups ADD CONSTRAINT group_creator_member
            FOREIGN KEY (id, creator_member_id) REFERENCES appachas.members(group_id, id)
            DEFERRABLE INITIALLY DEFERRED;
        CREATE TABLE appachas.movements (
            id uuid PRIMARY KEY,
            group_id uuid NOT NULL REFERENCES appachas.groups(id) ON DELETE CASCADE,
            type text NOT NULL CHECK (type IN ('expense','refund','contribution')),
            amount_cents bigint NOT NULL CHECK (amount_cents <> 0),
            concept text NOT NULL CHECK (length(concept) <= 50),
            movement_date date NOT NULL,
            payer_id uuid NOT NULL,
            created_at timestamptz NOT NULL,
            updated_at timestamptz NOT NULL,
            version integer NOT NULL DEFAULT 1 CHECK (version > 0),
            FOREIGN KEY (group_id, payer_id) REFERENCES appachas.members(group_id, id),
            UNIQUE (group_id, id),
            CHECK ((type = 'refund' AND amount_cents < 0) OR
                   (type IN ('expense','contribution') AND amount_cents > 0))
        );
        CREATE INDEX movement_history
            ON appachas.movements (group_id, movement_date DESC, created_at DESC);
        CREATE TABLE appachas.movement_allocations (
            movement_id uuid NOT NULL,
            group_id uuid NOT NULL,
            member_id uuid NOT NULL,
            amount_cents bigint NOT NULL,
            PRIMARY KEY (movement_id, member_id),
            FOREIGN KEY (group_id, movement_id)
                REFERENCES appachas.movements(group_id, id) ON DELETE CASCADE,
            FOREIGN KEY (group_id, member_id) REFERENCES appachas.members(group_id, id)
        );
        REVOKE ALL ON SCHEMA appachas FROM PUBLIC;
        REVOKE ALL ON ALL TABLES IN SCHEMA appachas FROM PUBLIC;
        ALTER TABLE appachas.groups ENABLE ROW LEVEL SECURITY;
        ALTER TABLE appachas.members ENABLE ROW LEVEL SECURITY;
        ALTER TABLE appachas.movements ENABLE ROW LEVEL SECURITY;
        ALTER TABLE appachas.movement_allocations ENABLE ROW LEVEL SECURITY;
    """)


def downgrade() -> None:
    op.execute("DROP SCHEMA appachas CASCADE")
