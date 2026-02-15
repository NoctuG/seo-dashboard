"""Add competitor and visibility history tables

Revision ID: d1f2e3a4b5c6
Revises: c9d4e7f8a1b2
Create Date: 2026-02-16 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'd1f2e3a4b5c6'
down_revision: Union[str, Sequence[str]] = 'c9d4e7f8a1b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'competitordomain',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('domain', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['project.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_competitordomain_project_id', 'competitordomain', ['project_id'])
    op.create_index('ix_competitordomain_domain', 'competitordomain', ['domain'])

    op.create_table(
        'visibilityhistory',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('keyword_id', sa.Integer(), nullable=True),
        sa.Column('keyword_term', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('source_domain', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('rank', sa.Integer(), nullable=True),
        sa.Column('visibility_score', sa.Float(), nullable=False),
        sa.Column('result_type', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('serp_features_json', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('competitor_positions_json', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('checked_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['keyword_id'], ['keyword.id']),
        sa.ForeignKeyConstraint(['project_id'], ['project.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_visibilityhistory_project_id', 'visibilityhistory', ['project_id'])
    op.create_index('ix_visibilityhistory_keyword_id', 'visibilityhistory', ['keyword_id'])
    op.create_index('ix_visibilityhistory_source_domain', 'visibilityhistory', ['source_domain'])
    op.create_index('ix_visibilityhistory_project_checked_at', 'visibilityhistory', ['project_id', 'checked_at'])


def downgrade() -> None:
    op.drop_index('ix_visibilityhistory_project_checked_at', table_name='visibilityhistory')
    op.drop_index('ix_visibilityhistory_source_domain', table_name='visibilityhistory')
    op.drop_index('ix_visibilityhistory_keyword_id', table_name='visibilityhistory')
    op.drop_index('ix_visibilityhistory_project_id', table_name='visibilityhistory')
    op.drop_table('visibilityhistory')

    op.drop_index('ix_competitordomain_domain', table_name='competitordomain')
    op.drop_index('ix_competitordomain_project_id', table_name='competitordomain')
    op.drop_table('competitordomain')
