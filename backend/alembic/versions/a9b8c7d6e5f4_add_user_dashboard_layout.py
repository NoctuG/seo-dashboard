"""add user dashboard layout

Revision ID: a9b8c7d6e5f4
Revises: f4d5e6f7a8b9, e7a1b2c3d4e5
Create Date: 2026-02-17 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a9b8c7d6e5f4"
down_revision: Union[str, Sequence[str], None] = ("f4d5e6f7a8b9", "e7a1b2c3d4e5")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "userdashboardlayout",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("layout_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["project.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_userdashboardlayout_user_id", "userdashboardlayout", ["user_id"], unique=False)
    op.create_index("ix_userdashboardlayout_project_id", "userdashboardlayout", ["project_id"], unique=False)
    op.create_index("ix_user_dashboard_layout_user_project", "userdashboardlayout", ["user_id", "project_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_user_dashboard_layout_user_project", table_name="userdashboardlayout")
    op.drop_index("ix_userdashboardlayout_project_id", table_name="userdashboardlayout")
    op.drop_index("ix_userdashboardlayout_user_id", table_name="userdashboardlayout")
    op.drop_table("userdashboardlayout")
