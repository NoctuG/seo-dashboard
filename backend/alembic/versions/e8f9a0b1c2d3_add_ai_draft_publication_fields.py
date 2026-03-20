"""add ai draft publication fields

Revision ID: e8f9a0b1c2d3
Revises: f4d5e6f7a8b9
Create Date: 2026-03-20 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e8f9a0b1c2d3'
down_revision = 'f4d5e6f7a8b9'
branch_labels = None
depends_on = None


aidraftpublicationstatus = sa.Enum('DRAFT', 'SAVED', 'PUBLISHED', name='aidraftpublicationstatus')


def upgrade() -> None:
    bind = op.get_bind()
    aidraftpublicationstatus.create(bind, checkfirst=True)
    op.add_column('aicontentdraft', sa.Column('target_url', sa.String(), nullable=True))
    op.add_column('aicontentdraft', sa.Column('publication_status', aidraftpublicationstatus, nullable=False, server_default='DRAFT'))
    op.create_index(op.f('ix_aicontentdraft_target_url'), 'aicontentdraft', ['target_url'], unique=False)
    op.create_index(op.f('ix_aicontentdraft_publication_status'), 'aicontentdraft', ['publication_status'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_aicontentdraft_publication_status'), table_name='aicontentdraft')
    op.drop_index(op.f('ix_aicontentdraft_target_url'), table_name='aicontentdraft')
    op.drop_column('aicontentdraft', 'publication_status')
    op.drop_column('aicontentdraft', 'target_url')
    bind = op.get_bind()
    aidraftpublicationstatus.drop(bind, checkfirst=True)
