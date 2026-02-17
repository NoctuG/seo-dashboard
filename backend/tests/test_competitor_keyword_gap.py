from app.api.endpoints.competitors import _compute_keyword_gap


def test_keyword_gap_without_competitors():
    result = _compute_keyword_gap(
        keyword_terms=["seo", "content"],
        my_ranks={"seo": 3, "content": 8},
        competitor_ranks=[],
    )

    assert result.common == []
    assert result.gap == []
    assert [row.keyword for row in result.unique] == ["seo", "content"]


def test_keyword_gap_with_one_competitor():
    result = _compute_keyword_gap(
        keyword_terms=["seo", "content", "backlink"],
        my_ranks={"seo": 2, "content": None, "backlink": 6},
        competitor_ranks=[{"seo": 4, "content": 3}],
    )

    assert [row.keyword for row in result.common] == ["seo"]
    assert [row.keyword for row in result.gap] == ["content"]
    assert [row.keyword for row in result.unique] == ["backlink"]


def test_keyword_gap_with_three_competitors():
    result = _compute_keyword_gap(
        keyword_terms=["seo", "content", "brand"],
        my_ranks={"seo": 1, "content": None, "brand": 5},
        competitor_ranks=[
            {"seo": 2, "content": None},
            {"seo": None, "content": 6},
            {"seo": None, "content": None},
        ],
    )

    assert [row.keyword for row in result.common] == ["seo"]
    assert [row.keyword for row in result.gap] == ["content"]
    assert [row.keyword for row in result.unique] == ["brand"]
    assert result.common[0].competitor_a_rank == 2
    assert result.gap[0].competitor_b_rank == 6


def test_keyword_gap_with_empty_keywords():
    result = _compute_keyword_gap(
        keyword_terms=[],
        my_ranks={},
        competitor_ranks=[{"seo": 2}],
    )

    assert result.common == []
    assert result.gap == []
    assert result.unique == []


def test_keyword_gap_deduplicates_keywords_case_insensitive():
    result = _compute_keyword_gap(
        keyword_terms=["SEO", "seo", " Seo "],
        my_ranks={"seo": 3},
        competitor_ranks=[{"seo": 1}],
    )

    assert len(result.common) == 1
    assert result.common[0].keyword == "SEO"
