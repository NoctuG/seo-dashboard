"""Add serp feature cache field to keyword

Revision ID: f3c4d5e6a7b8
Revises: ab12cd34ef56
Create Date: 2026-02-17 00:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = "f3c4d5e6a7b8"
down_revision: Union[str, Sequence[str], None] = "ab12cd34ef56"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "keyword",
        sa.Column(
            "serp_features_json",
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=False,
            server_default="[]",
        ),
    )


def downgrade() -> None:
    op.drop_column("keyword", "serp_features_json")
