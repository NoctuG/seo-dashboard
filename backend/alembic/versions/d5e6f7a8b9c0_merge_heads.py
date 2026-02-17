"""merge heads: ai_content_drafts + site_audit_history

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9, f2a3b4c5d6e7
Create Date: 2026-02-17 00:00:00.000000
"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "d5e6f7a8b9c0"
down_revision: Union[str, Sequence[str]] = ("c4d5e6f7a8b9", "f2a3b4c5d6e7")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
