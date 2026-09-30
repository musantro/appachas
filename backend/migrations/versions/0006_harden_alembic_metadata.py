"""Keep migration metadata outside the public Data API surface."""

from alembic import op

revision = "0006"
down_revision = "0005"


def upgrade() -> None:
    op.execute("""
        ALTER TABLE public.alembic_version ENABLE ROW LEVEL SECURITY;
        REVOKE ALL ON TABLE public.alembic_version FROM PUBLIC;
        ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public
            REVOKE ALL ON TABLES FROM PUBLIC;

        DO $security$
        DECLARE
            api_role text;
        BEGIN
            FOR api_role IN
                SELECT rolname
                FROM pg_roles
                WHERE rolname IN ('anon', 'authenticated', 'service_role')
            LOOP
                EXECUTE format(
                    'REVOKE ALL ON TABLE public.alembic_version FROM %I',
                    api_role
                );
                EXECUTE format(
                    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
                    'REVOKE ALL ON TABLES FROM %I',
                    current_user,
                    api_role
                );
            END LOOP;
        END
        $security$;
    """)


def downgrade() -> None:
    # Re-granting public access would recreate the exposure this revision removes.
    pass
