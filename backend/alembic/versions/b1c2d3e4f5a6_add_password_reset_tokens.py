"""add password reset tokens

Revision ID: b1c2d3e4f5a6
Revises: aa11bb22cc33
Create Date: 2026-02-16 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "b1c2d3e4f5a6"
down_revision = "aa11bb22cc33"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "passwordresettoken",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index(op.f("ix_passwordresettoken_user_id"), "passwordresettoken", ["user_id"], unique=False)
    op.create_index(op.f("ix_passwordresettoken_token_hash"), "passwordresettoken", ["token_hash"], unique=True)
    op.create_index(op.f("ix_passwordresettoken_expires_at"), "passwordresettoken", ["expires_at"], unique=False)
    op.create_index(op.f("ix_passwordresettoken_used_at"), "passwordresettoken", ["used_at"], unique=False)
    op.create_index(
        "ix_passwordresettoken_user_expires_at",
        "passwordresettoken",
        ["user_id", "expires_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_passwordresettoken_user_expires_at", table_name="passwordresettoken")
    op.drop_index(op.f("ix_passwordresettoken_used_at"), table_name="passwordresettoken")
    op.drop_index(op.f("ix_passwordresettoken_expires_at"), table_name="passwordresettoken")
    op.drop_index(op.f("ix_passwordresettoken_token_hash"), table_name="passwordresettoken")
    op.drop_index(op.f("ix_passwordresettoken_user_id"), table_name="passwordresettoken")
    op.drop_table("passwordresettoken")
