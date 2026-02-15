"""add reporting tables

Revision ID: f1e2d3c4b5a6
Revises: c9d4e7f8a1b2
Create Date: 2026-02-15 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f1e2d3c4b5a6'
down_revision = 'c9d4e7f8a1b2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'reporttemplate',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('indicators_json', sa.String(), nullable=False),
        sa.Column('brand_styles_json', sa.String(), nullable=False),
        sa.Column('time_range', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['project.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_reporttemplate_project_id'), 'reporttemplate', ['project_id'], unique=False)

    op.create_table(
        'reportschedule',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('template_id', sa.Integer(), nullable=False),
        sa.Column('cron_expression', sa.String(), nullable=False),
        sa.Column('timezone', sa.String(), nullable=False),
        sa.Column('recipient_email', sa.String(), nullable=False),
        sa.Column('active', sa.Boolean(), nullable=False),
        sa.Column('retry_limit', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['project.id']),
        sa.ForeignKeyConstraint(['template_id'], ['reporttemplate.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_reportschedule_project_id'), 'reportschedule', ['project_id'], unique=False)
    op.create_index(op.f('ix_reportschedule_template_id'), 'reportschedule', ['template_id'], unique=False)

    op.create_table(
        'reportdeliverylog',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('template_id', sa.Integer(), nullable=True),
        sa.Column('schedule_id', sa.Integer(), nullable=True),
        sa.Column('format', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('retries', sa.Integer(), nullable=False),
        sa.Column('recipient_email', sa.String(), nullable=True),
        sa.Column('error_message', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['project.id']),
        sa.ForeignKeyConstraint(['schedule_id'], ['reportschedule.id']),
        sa.ForeignKeyConstraint(['template_id'], ['reporttemplate.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_reportdeliverylog_project_id'), 'reportdeliverylog', ['project_id'], unique=False)
    op.create_index(op.f('ix_reportdeliverylog_schedule_id'), 'reportdeliverylog', ['schedule_id'], unique=False)
    op.create_index(op.f('ix_reportdeliverylog_template_id'), 'reportdeliverylog', ['template_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_reportdeliverylog_template_id'), table_name='reportdeliverylog')
    op.drop_index(op.f('ix_reportdeliverylog_schedule_id'), table_name='reportdeliverylog')
    op.drop_index(op.f('ix_reportdeliverylog_project_id'), table_name='reportdeliverylog')
    op.drop_table('reportdeliverylog')

    op.drop_index(op.f('ix_reportschedule_template_id'), table_name='reportschedule')
    op.drop_index(op.f('ix_reportschedule_project_id'), table_name='reportschedule')
    op.drop_table('reportschedule')

    op.drop_index(op.f('ix_reporttemplate_project_id'), table_name='reporttemplate')
    op.drop_table('reporttemplate')
