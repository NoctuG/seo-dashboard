"""add project brand rules

Revision ID: e3f4a5b6c7d8
Revises: d1f2e3a4b5c6
Create Date: 2026-02-15
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "e3f4a5b6c7d8"
down_revision = "d1f2e3a4b5c6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("project", sa.Column("brand_keywords_json", sa.String(), nullable=False, server_default="[]"))
    op.add_column("project", sa.Column("brand_regex", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("project", "brand_regex")
    op.drop_column("project", "brand_keywords_json")
