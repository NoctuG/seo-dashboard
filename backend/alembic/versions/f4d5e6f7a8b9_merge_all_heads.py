"""Merge all Alembic heads

Revision ID: f4d5e6f7a8b9
Revises: c4d5e6f7a8b9, f2a3b4c5d6e7, f3c4d5e6a7b8
Create Date: 2026-02-17 00:20:00.000000

"""
from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "f4d5e6f7a8b9"
down_revision: Union[str, Sequence[str], None] = (
    "c4d5e6f7a8b9",
    "f2a3b4c5d6e7",
    "f3c4d5e6a7b8",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
