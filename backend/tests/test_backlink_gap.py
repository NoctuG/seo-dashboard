from datetime import datetime

from app.api.endpoints.competitors import _sort_backlink_rows
from app.backlink_gap_service import BacklinkGapDomainRow, SnapshotBacklinkGapProvider


def test_sort_backlink_rows_by_da_desc_with_missing_values_last():
    rows = [
        BacklinkGapDomainRow("a.com", da=12, link_type=None, anchor_text=None, target_url=None, first_seen_at=None),
        BacklinkGapDomainRow("b.com", da=None, link_type=None, anchor_text=None, target_url=None, first_seen_at=None),
        BacklinkGapDomainRow("c.com", da=43, link_type=None, anchor_text=None, target_url=None, first_seen_at=None),
    ]

    sorted_rows = _sort_backlink_rows(rows, sort_by="da", sort_order="desc")
    assert [row.referring_domain for row in sorted_rows] == ["c.com", "a.com", "b.com"]


def test_sort_backlink_rows_by_first_seen_at_asc_with_missing_values_last():
    rows = [
        BacklinkGapDomainRow("a.com", da=None, link_type=None, anchor_text=None, target_url=None, first_seen_at=datetime(2024, 1, 3)),
        BacklinkGapDomainRow("b.com", da=None, link_type=None, anchor_text=None, target_url=None, first_seen_at=None),
        BacklinkGapDomainRow("c.com", da=None, link_type=None, anchor_text=None, target_url=None, first_seen_at=datetime(2024, 1, 1)),
    ]

    sorted_rows = _sort_backlink_rows(rows, sort_by="first_seen_at", sort_order="asc")
    assert [row.referring_domain for row in sorted_rows] == ["c.com", "a.com", "b.com"]


def test_snapshot_provider_normalizes_top_backlink_shape():
    provider = SnapshotBacklinkGapProvider()
    normalized = provider._normalize_rows(
        [
            {
                "source": "ref.example.com",
                "da": 51,
                "type": "dofollow",
                "anchor": "seo tool",
                "url": "https://target.example.com/page",
                "date": "2024-05-01",
            }
        ]
    )

    assert normalized[0].referring_domain == "ref.example.com"
    assert normalized[0].da == 51
    assert normalized[0].link_type == "dofollow"
    assert normalized[0].anchor_text == "seo tool"
    assert normalized[0].target_url == "https://target.example.com/page"
    assert normalized[0].first_seen_at is not None
