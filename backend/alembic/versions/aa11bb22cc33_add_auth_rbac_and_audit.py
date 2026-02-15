"""add auth rbac and audit

Revision ID: aa11bb22cc33
Revises: a1b2c3d4e5f6, f1e2d3c4b5a6
Create Date: 2026-02-15 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "aa11bb22cc33"
down_revision: Union[str, Sequence[str]] = ("a1b2c3d4e5f6", "f1e2d3c4b5a6")
branch_labels = None
depends_on = None


def upgrade() -> None:
    is_sqlite = op.get_bind().dialect.name == "sqlite"

    op.add_column("project", sa.Column("organization_id", sa.Integer(), nullable=True))
    op.create_index("ix_project_organization_id", "project", ["organization_id"], unique=False)

    op.create_table(
        "organization",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_organization_name", "organization", ["name"], unique=True)

    op.create_table(
        "user",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_superuser", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_email", "user", ["email"], unique=True)

    op.create_table(
        "role",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_role_name", "role", ["name"], unique=True)

    op.create_table(
        "organizationmember",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_organizationmember_organization_id", "organizationmember", ["organization_id"], unique=False)
    op.create_index("ix_organizationmember_user_id", "organizationmember", ["user_id"], unique=False)

    op.create_table(
        "projectmember",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["project.id"]),
        sa.ForeignKeyConstraint(["role_id"], ["role.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_projectmember_project_id", "projectmember", ["project_id"], unique=False)
    op.create_index("ix_projectmember_role_id", "projectmember", ["role_id"], unique=False)
    op.create_index("ix_projectmember_user_id", "projectmember", ["user_id"], unique=False)

    op.create_table(
        "auditlog",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("entity_type", sa.String(), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("metadata_json", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_auditlog_user_id", "auditlog", ["user_id"], unique=False)
    op.create_index("ix_auditlog_action", "auditlog", ["action"], unique=False)
    op.create_index("ix_auditlog_entity_type", "auditlog", ["entity_type"], unique=False)
    op.create_index("ix_auditlog_entity_id", "auditlog", ["entity_id"], unique=False)

    if is_sqlite:
        # SQLite does not support adding a named foreign key constraint via ALTER TABLE.
        # We skip it here to keep this migration compatible across dialects.
        pass
    else:
        op.create_foreign_key("fk_project_organization", "project", "organization", ["organization_id"], ["id"])


def downgrade() -> None:
    is_sqlite = op.get_bind().dialect.name == "sqlite"

    if not is_sqlite:
        op.drop_constraint("fk_project_organization", "project", type_="foreignkey")

    op.drop_index("ix_auditlog_entity_id", table_name="auditlog")
    op.drop_index("ix_auditlog_entity_type", table_name="auditlog")
    op.drop_index("ix_auditlog_action", table_name="auditlog")
    op.drop_index("ix_auditlog_user_id", table_name="auditlog")
    op.drop_table("auditlog")

    op.drop_index("ix_projectmember_user_id", table_name="projectmember")
    op.drop_index("ix_projectmember_role_id", table_name="projectmember")
    op.drop_index("ix_projectmember_project_id", table_name="projectmember")
    op.drop_table("projectmember")

    op.drop_index("ix_organizationmember_user_id", table_name="organizationmember")
    op.drop_index("ix_organizationmember_organization_id", table_name="organizationmember")
    op.drop_table("organizationmember")

    op.drop_index("ix_role_name", table_name="role")
    op.drop_table("role")

    op.drop_index("ix_user_email", table_name="user")
    op.drop_table("user")

    op.drop_index("ix_organization_name", table_name="organization")
    op.drop_table("organization")

    op.drop_index("ix_project_organization_id", table_name="project")
    op.drop_column("project", "organization_id")
