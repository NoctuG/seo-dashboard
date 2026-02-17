from datetime import datetime

from sqlmodel import Session, SQLModel, create_engine

from app.competitor_traffic_service import competitor_traffic_service
from app.models import CompetitorDomain, Keyword, Project, VisibilityHistory


def _build_session() -> Session:
    engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(engine)
    return Session(engine)


def _seed_project_and_competitor(session: Session) -> tuple[Project, CompetitorDomain]:
    project = Project(name="Demo", domain="example.com")
    session.add(project)
    session.commit()
    session.refresh(project)

    competitor = CompetitorDomain(project_id=project.id, domain="competitor.com")
    session.add(competitor)
    session.commit()
    session.refresh(competitor)
    return project, competitor


def test_local_estimation_returns_empty_arrays_when_no_history(monkeypatch):
    monkeypatch.setattr("app.competitor_traffic_service.settings.SIMILARWEB_API_KEY", "")
    monkeypatch.setattr("app.competitor_traffic_service.settings.TRAFFIC_OVERVIEW_EXTERNAL_API_URL", "")
    with _build_session() as session:
        project, competitor = _seed_project_and_competitor(session)

        overview = competitor_traffic_service.get_overview(session, project=project, competitor=competitor)

        assert overview.data_source == "local_estimation"
        assert overview.monthly_trend == []
        assert overview.top_pages == []
        assert overview.top_keywords == []
        assert overview.notes == []


def test_local_estimation_builds_monthly_trend_and_top_keywords(monkeypatch):
    monkeypatch.setattr("app.competitor_traffic_service.settings.SIMILARWEB_API_KEY", "")
    monkeypatch.setattr("app.competitor_traffic_service.settings.TRAFFIC_OVERVIEW_EXTERNAL_API_URL", "")
    with _build_session() as session:
        project, competitor = _seed_project_and_competitor(session)
        session.add(Keyword(project_id=project.id, term="seo"))
        session.add(Keyword(project_id=project.id, term="backlink"))

        now = datetime.utcnow()
        session.add(
            VisibilityHistory(
                project_id=project.id,
                keyword_term="seo",
                source_domain="example.com",
                rank=2,
                checked_at=now,
            )
        )
        session.add(
            VisibilityHistory(
                project_id=project.id,
                keyword_term="seo",
                source_domain="competitor.com",
                rank=1,
                checked_at=now,
            )
        )
        session.add(
            VisibilityHistory(
                project_id=project.id,
                keyword_term="backlink",
                source_domain="competitor.com",
                rank=4,
                checked_at=now,
            )
        )
        session.commit()
        session.refresh(competitor)

        overview = competitor_traffic_service.get_overview(session, project=project, competitor=competitor)

        assert len(overview.monthly_trend) == 12
        assert overview.monthly_trend[-1].my_site > 0
        assert overview.monthly_trend[-1].competitor > 0
        assert overview.top_keywords
        assert overview.top_keywords[0].estimated_clicks >= overview.top_keywords[-1].estimated_clicks


def test_similarweb_success(monkeypatch):
    monkeypatch.setattr("app.competitor_traffic_service.settings.SIMILARWEB_API_KEY", "demo-key")
    monkeypatch.setattr("app.competitor_traffic_service.settings.SIMILARWEB_BASE_URL", "https://api.similarweb.com")
    monkeypatch.setattr("app.competitor_traffic_service.settings.TRAFFIC_OVERVIEW_EXTERNAL_API_URL", "")

    class _Response:
        status_code = 200

        @staticmethod
        def json():
            return {
                "monthly_trend": [
                    {"month": "2026-01", "my_site": 120.5, "competitor": 860.0},
                    {"month": "2026-02", "my_site": 132.0, "competitor": 905.5},
                ],
                "top_pages": [{"url": "https://competitor.com/blog", "estimated_traffic": 420.0, "keyword_count": 34}],
                "top_keywords": [{"keyword": "seo tools", "rank": 3, "search_volume": 7000, "estimated_clicks": 770.0}],
            }

        text = ""

    monkeypatch.setattr("app.competitor_traffic_service.requests.get", lambda *args, **kwargs: _Response())

    with _build_session() as session:
        project, competitor = _seed_project_and_competitor(session)

        overview = competitor_traffic_service.get_overview(session, project=project, competitor=competitor)

        assert overview.data_source == "similarweb"
        assert len(overview.monthly_trend) == 2
        assert overview.top_pages[0].url == "https://competitor.com/blog"
        assert overview.top_keywords[0].keyword == "seo tools"
        assert overview.notes == []


def test_similarweb_rate_limit_falls_back_with_observable_note(monkeypatch):
    monkeypatch.setattr("app.competitor_traffic_service.settings.SIMILARWEB_API_KEY", "demo-key")
    monkeypatch.setattr("app.competitor_traffic_service.settings.SIMILARWEB_MAX_RETRIES", 0)
    monkeypatch.setattr("app.competitor_traffic_service.settings.TRAFFIC_OVERVIEW_EXTERNAL_API_URL", "")

    class _RateLimitedResponse:
        status_code = 429
        text = "rate limited"

        @staticmethod
        def json():
            return {}

    monkeypatch.setattr("app.competitor_traffic_service.requests.get", lambda *args, **kwargs: _RateLimitedResponse())

    with _build_session() as session:
        project, competitor = _seed_project_and_competitor(session)

        overview = competitor_traffic_service.get_overview(session, project=project, competitor=competitor)

        assert overview.data_source == "local_estimation"
        assert any("similarweb_rate_limited_429" in note for note in overview.notes)


def test_similarweb_auth_failure_falls_back_with_observable_note(monkeypatch):
    monkeypatch.setattr("app.competitor_traffic_service.settings.SIMILARWEB_API_KEY", "demo-key")
    monkeypatch.setattr("app.competitor_traffic_service.settings.SIMILARWEB_MAX_RETRIES", 0)
    monkeypatch.setattr("app.competitor_traffic_service.settings.TRAFFIC_OVERVIEW_EXTERNAL_API_URL", "")

    class _UnauthorizedResponse:
        status_code = 401
        text = "invalid api key"

        @staticmethod
        def json():
            return {}

    monkeypatch.setattr("app.competitor_traffic_service.requests.get", lambda *args, **kwargs: _UnauthorizedResponse())

    with _build_session() as session:
        project, competitor = _seed_project_and_competitor(session)

        overview = competitor_traffic_service.get_overview(session, project=project, competitor=competitor)

        assert overview.data_source == "local_estimation"
        assert any("similarweb_auth_error_401" in note for note in overview.notes)
