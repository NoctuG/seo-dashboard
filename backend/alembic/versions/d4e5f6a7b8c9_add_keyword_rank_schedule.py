"""add keyword rank schedule

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8, e7a1b2c3d4e5
Create Date: 2026-02-16 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = ("c3d4e5f6a7b8", "e7a1b2c3d4e5")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "keywordrankschedule",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("frequency", sa.String(), nullable=False, server_default="daily"),
        sa.Column("day_of_week", sa.Integer(), nullable=True),
        sa.Column("hour", sa.Integer(), nullable=False, server_default="9"),
        sa.Column("timezone", sa.String(), nullable=False, server_default="UTC"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_run_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["project.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id"),
    )
    op.create_index(op.f("ix_keywordrankschedule_project_id"), "keywordrankschedule", ["project_id"], unique=True)
    op.create_index(
        "ix_keywordrankschedule_active_frequency",
        "keywordrankschedule",
        ["active", "frequency"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_keywordrankschedule_active_frequency", table_name="keywordrankschedule")
    op.drop_index(op.f("ix_keywordrankschedule_project_id"), table_name="keywordrankschedule")
    op.drop_table("keywordrankschedule")
