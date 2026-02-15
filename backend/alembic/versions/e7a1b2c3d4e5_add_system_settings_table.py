"""add system settings table

Revision ID: e7a1b2c3d4e5
Revises: f1e2d3c4b5a6
Create Date: 2026-02-16 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e7a1b2c3d4e5'
down_revision = 'f1e2d3c4b5a6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'systemsettings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('smtp_json', sa.String(), nullable=False),
        sa.Column('analytics_json', sa.String(), nullable=False),
        sa.Column('ai_json', sa.String(), nullable=False),
        sa.Column('crawler_json', sa.String(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('systemsettings')
