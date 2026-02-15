"""Add backlink snapshot fetch/cache fields

Revision ID: ab12cd34ef56
Revises: d4e5f6a7b8c9
Create Date: 2026-02-16 00:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = "ab12cd34ef56"
down_revision: Union[str, Sequence[str], None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("backlinksnapshot", sa.Column("top_backlinks_json", sqlmodel.sql.sqltypes.AutoString(), nullable=False, server_default="[]"))
    op.add_column("backlinksnapshot", sa.Column("ahrefs_rank", sa.Integer(), nullable=True))
    op.add_column("backlinksnapshot", sa.Column("last_fetched_at", sa.DateTime(), nullable=True))
    op.add_column("backlinksnapshot", sa.Column("fetch_status", sqlmodel.sql.sqltypes.AutoString(), nullable=False, server_default="pending"))

    op.create_index("ix_backlinksnapshot_fetch_status", "backlinksnapshot", ["fetch_status"])
    op.create_index("ix_backlinksnapshot_project_last_fetched", "backlinksnapshot", ["project_id", "last_fetched_at"])


def downgrade() -> None:
    op.drop_index("ix_backlinksnapshot_project_last_fetched", table_name="backlinksnapshot")
    op.drop_index("ix_backlinksnapshot_fetch_status", table_name="backlinksnapshot")

    op.drop_column("backlinksnapshot", "fetch_status")
    op.drop_column("backlinksnapshot", "last_fetched_at")
    op.drop_column("backlinksnapshot", "ahrefs_rank")
    op.drop_column("backlinksnapshot", "top_backlinks_json")
