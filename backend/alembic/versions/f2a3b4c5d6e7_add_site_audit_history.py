"""add site audit history

Revision ID: f2a3b4c5d6e7
Revises: a1b2c3d4e5f6
Create Date: 2026-02-17 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f2a3b4c5d6e7"
down_revision: Union[str, Sequence[str]] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "siteaudithistory",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("crawl_id", sa.Integer(), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("calculated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["crawl_id"], ["crawl.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["project.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_siteaudithistory_project_id", "siteaudithistory", ["project_id"])
    op.create_index("ix_siteaudithistory_crawl_id", "siteaudithistory", ["crawl_id"])
    op.create_index("ix_siteaudithistory_calculated_at", "siteaudithistory", ["calculated_at"])
    op.create_index(
        "ix_siteaudithistory_project_calculated_at",
        "siteaudithistory",
        ["project_id", "calculated_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_siteaudithistory_project_calculated_at", table_name="siteaudithistory")
    op.drop_index("ix_siteaudithistory_calculated_at", table_name="siteaudithistory")
    op.drop_index("ix_siteaudithistory_crawl_id", table_name="siteaudithistory")
    op.drop_index("ix_siteaudithistory_project_id", table_name="siteaudithistory")
    op.drop_table("siteaudithistory")
