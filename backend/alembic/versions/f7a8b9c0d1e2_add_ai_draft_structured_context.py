"""add ai draft structured context

Revision ID: f7a8b9c0d1e2
Revises: e8f9a0b1c2d3
Create Date: 2026-03-20 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f7a8b9c0d1e2'
down_revision = 'e8f9a0b1c2d3'
branch_labels = None
depends_on = None


STRUCTURED_DRAFT_COLUMNS = (
    'keyword_plan',
    'serp_snapshot',
    'content_brief',
    'on_page_recommendations',
    'quality_review',
    'publish_review_metadata',
)


def upgrade() -> None:
    for column_name in STRUCTURED_DRAFT_COLUMNS:
        op.add_column(
            'aicontentdraft',
            sa.Column(column_name, sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        )


def downgrade() -> None:
    for column_name in reversed(STRUCTURED_DRAFT_COLUMNS):
        op.drop_column('aicontentdraft', column_name)
