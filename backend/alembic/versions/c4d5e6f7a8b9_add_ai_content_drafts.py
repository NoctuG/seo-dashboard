"""add ai content drafts

Revision ID: c4d5e6f7a8b9
Revises: b2c3d4e5f6a7
Create Date: 2026-02-17 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision = 'c4d5e6f7a8b9'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'aicontentdraft',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('lineage_id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('content_type', sa.Enum('ARTICLE', 'SOCIAL', name='aidraftcontenttype'), nullable=False),
        sa.Column('title', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('canvas_document_json', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('export_text', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('updated_by', sa.Integer(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['project.id'], ),
        sa.ForeignKeyConstraint(['updated_by'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_aicontentdraft_content_type'), 'aicontentdraft', ['content_type'], unique=False)
    op.create_index(op.f('ix_aicontentdraft_lineage_id'), 'aicontentdraft', ['lineage_id'], unique=False)
    op.create_index(op.f('ix_aicontentdraft_project_id'), 'aicontentdraft', ['project_id'], unique=False)
    op.create_index(op.f('ix_aicontentdraft_updated_at'), 'aicontentdraft', ['updated_at'], unique=False)
    op.create_index(op.f('ix_aicontentdraft_updated_by'), 'aicontentdraft', ['updated_by'], unique=False)
    op.create_index('ix_ai_content_draft_project_lineage_version', 'aicontentdraft', ['project_id', 'lineage_id', 'version'], unique=True)
    op.create_index('ix_ai_content_draft_project_updated', 'aicontentdraft', ['project_id', 'updated_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_ai_content_draft_project_updated', table_name='aicontentdraft')
    op.drop_index('ix_ai_content_draft_project_lineage_version', table_name='aicontentdraft')
    op.drop_index(op.f('ix_aicontentdraft_updated_by'), table_name='aicontentdraft')
    op.drop_index(op.f('ix_aicontentdraft_updated_at'), table_name='aicontentdraft')
    op.drop_index(op.f('ix_aicontentdraft_project_id'), table_name='aicontentdraft')
    op.drop_index(op.f('ix_aicontentdraft_lineage_id'), table_name='aicontentdraft')
    op.drop_index(op.f('ix_aicontentdraft_content_type'), table_name='aicontentdraft')
    op.drop_table('aicontentdraft')
    op.execute('DROP TYPE aidraftcontenttype')
