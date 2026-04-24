"""add brand context version to ai drafts

Revision ID: 9a1b2c3d4e5f
Revises: f4d5e6f7a8b9
Create Date: 2026-04-24 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "9a1b2c3d4e5f"
down_revision = "f4d5e6f7a8b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ai_content_draft", sa.Column("brand_context_version", sa.String(length=64), nullable=True))
    op.create_index("ix_ai_content_draft_brand_context_version", "ai_content_draft", ["brand_context_version"])


def downgrade() -> None:
    op.drop_index("ix_ai_content_draft_brand_context_version", table_name="ai_content_draft")
    op.drop_column("ai_content_draft", "brand_context_version")
