"""add page performance snapshots

Revision ID: a1b2c3d4e5f6
Revises: f6a7b8c9d0e1
Create Date: 2026-02-15 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str]] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pageperformancesnapshot",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("page_id", sa.Integer(), nullable=False),
        sa.Column("checked_at", sa.DateTime(), nullable=False),
        sa.Column("lcp_ms", sa.Integer(), nullable=True),
        sa.Column("fcp_ms", sa.Integer(), nullable=True),
        sa.Column("cls", sa.Float(), nullable=True),
        sa.Column("source", sa.String(), nullable=False, server_default="unavailable"),
        sa.ForeignKeyConstraint(["page_id"], ["page.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pageperformancesnapshot_page_id", "pageperformancesnapshot", ["page_id"])
    op.create_index(
        "ix_pageperf_page_checked_at",
        "pageperformancesnapshot",
        ["page_id", "checked_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_pageperf_page_checked_at", table_name="pageperformancesnapshot")
    op.drop_index("ix_pageperformancesnapshot_page_id", table_name="pageperformancesnapshot")
    op.drop_table("pageperformancesnapshot")
