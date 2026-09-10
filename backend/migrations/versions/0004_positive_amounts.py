"""Store positive magnitudes; movement type determines the calculation sign."""

from alembic import op

revision = "0004"
down_revision = "0003"


def upgrade() -> None:
    op.execute("""
        ALTER TABLE appachas.movements DROP CONSTRAINT movements_check;
        ALTER TABLE appachas.movements DROP CONSTRAINT movements_amount_cents_check;
        UPDATE appachas.movements SET amount_cents=abs(amount_cents) WHERE amount_cents < 0;
        UPDATE appachas.movement_allocations SET amount_cents=abs(amount_cents)
            WHERE amount_cents < 0;
        ALTER TABLE appachas.movements ADD CONSTRAINT movements_amount_cents_check
            CHECK (amount_cents > 0);
        ALTER TABLE appachas.movement_allocations ADD CONSTRAINT allocations_nonnegative
            CHECK (amount_cents >= 0);
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE appachas.movements DROP CONSTRAINT movements_amount_cents_check;
        ALTER TABLE appachas.movement_allocations DROP CONSTRAINT allocations_nonnegative;
        UPDATE appachas.movements SET amount_cents=-amount_cents WHERE type='refund';
        UPDATE appachas.movement_allocations AS allocation
            SET amount_cents=-allocation.amount_cents FROM appachas.movements AS movement
            WHERE allocation.movement_id=movement.id AND movement.type='refund';
        ALTER TABLE appachas.movements ADD CONSTRAINT movements_amount_cents_check
            CHECK (amount_cents <> 0);
        ALTER TABLE appachas.movements ADD CONSTRAINT movements_check
            CHECK ((type='refund' AND amount_cents < 0) OR
                   (type IN ('expense','contribution') AND amount_cents > 0));
    """)
