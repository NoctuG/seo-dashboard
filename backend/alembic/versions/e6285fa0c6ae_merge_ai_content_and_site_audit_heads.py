"""merge_ai_content_and_site_audit_heads

Revision ID: e6285fa0c6ae
Revises: c4d5e6f7a8b9, f2a3b4c5d6e7
Create Date: 2026-02-17 05:31:38.366304

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e6285fa0c6ae'
down_revision: Union[str, Sequence[str], None] = ('c4d5e6f7a8b9', 'f2a3b4c5d6e7')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
