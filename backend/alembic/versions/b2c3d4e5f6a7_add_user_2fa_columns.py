"""add user 2fa columns

Revision ID: b2c3d4e5f6a7
Revises: ab12cd34ef56
Create Date: 2026-02-16 09:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, Sequence[str], None] = "ab12cd34ef56"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("user") as batch_op:
        batch_op.add_column(sa.Column("two_factor_secret", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("two_factor_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column("two_factor_backup_codes_hash", sa.String(), nullable=False, server_default="[]"))


def downgrade() -> None:
    with op.batch_alter_table("user") as batch_op:
        batch_op.drop_column("two_factor_backup_codes_hash")
        batch_op.drop_column("two_factor_enabled")
        batch_op.drop_column("two_factor_secret")
