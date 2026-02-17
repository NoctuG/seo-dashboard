from datetime import datetime

from sqlmodel import Session, SQLModel, create_engine

from app.competitor_traffic_service import competitor_traffic_service
from app.models import CompetitorDomain, Keyword, Project, VisibilityHistory


def _build_session() -> Session:
    engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(engine)
    return Session(engine)


def test_local_estimation_returns_empty_arrays_when_no_history():
    with _build_session() as session:
        project = Project(name="Demo", domain="example.com")
        session.add(project)
        session.commit()
        session.refresh(project)

        competitor = CompetitorDomain(project_id=project.id, domain="competitor.com")
        session.add(competitor)
        session.commit()
        session.refresh(competitor)

        overview = competitor_traffic_service.get_overview(session, project=project, competitor=competitor)

        assert overview.data_source == "local_estimation"
        assert overview.monthly_trend == []
        assert overview.top_pages == []
        assert overview.top_keywords == []


def test_local_estimation_builds_monthly_trend_and_top_keywords():
    with _build_session() as session:
        project = Project(name="Demo", domain="example.com")
        session.add(project)
        session.commit()
        session.refresh(project)

        competitor = CompetitorDomain(project_id=project.id, domain="competitor.com")
        session.add(competitor)
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
