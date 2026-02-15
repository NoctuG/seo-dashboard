"""Add SEO cost config table

Revision ID: f6a7b8c9d0e1
Revises: e3f4a5b6c7d8
Create Date: 2026-02-16 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, Sequence[str]] = 'e3f4a5b6c7d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'seocostconfig',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('monthly_human_cost', sa.Float(), nullable=False),
        sa.Column('monthly_tool_cost', sa.Float(), nullable=False),
        sa.Column('monthly_outsourcing_cost', sa.Float(), nullable=False),
        sa.Column('monthly_content_cost', sa.Float(), nullable=False),
        sa.Column('currency', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('attribution_model', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['project.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('project_id'),
    )
    op.create_index('ix_seocostconfig_project_id', 'seocostconfig', ['project_id'])


def downgrade() -> None:
    op.drop_index('ix_seocostconfig_project_id', table_name='seocostconfig')
    op.drop_table('seocostconfig')
