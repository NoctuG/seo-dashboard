"""Add domain/backlink snapshot tables

Revision ID: c9d4e7f8a1b2
Revises: b8f3a1c2d4e5
Create Date: 2026-02-15 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'c9d4e7f8a1b2'
down_revision: Union[str, Sequence[str]] = 'b8f3a1c2d4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'domainmetricsnapshot',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('domain_authority', sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['project.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_domainmetricsnapshot_project_id', 'domainmetricsnapshot', ['project_id'])
    op.create_index('ix_domainmetric_project_date', 'domainmetricsnapshot', ['project_id', 'date'])

    op.create_table(
        'backlinksnapshot',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('backlinks_total', sa.Integer(), nullable=False),
        sa.Column('ref_domains', sa.Integer(), nullable=False),
        sa.Column('anchor_distribution_json', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('new_links_json', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('lost_links_json', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('notes_json', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('provider', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['project.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_backlinksnapshot_project_id', 'backlinksnapshot', ['project_id'])
    op.create_index('ix_backlinksnapshot_project_date', 'backlinksnapshot', ['project_id', 'date'])


def downgrade() -> None:
    op.drop_index('ix_backlinksnapshot_project_date', table_name='backlinksnapshot')
    op.drop_index('ix_backlinksnapshot_project_id', table_name='backlinksnapshot')
    op.drop_table('backlinksnapshot')

    op.drop_index('ix_domainmetric_project_date', table_name='domainmetricsnapshot')
    op.drop_index('ix_domainmetricsnapshot_project_id', table_name='domainmetricsnapshot')
    op.drop_table('domainmetricsnapshot')
