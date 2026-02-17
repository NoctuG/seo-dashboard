import pytest
from fastapi import HTTPException
from sqlmodel import SQLModel, Session, create_engine

from app.api.endpoints.keywords import update_competitor
from app.core.error_codes import ErrorCode
from app.models import CompetitorDomain, Project
from app.schemas import CompetitorDomainUpdate


def _build_session() -> Session:
    engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(engine)
    return Session(engine)


def test_update_competitor_success_normalizes_domain():
    with _build_session() as session:
        project = Project(name="Demo", domain="example.com")
        session.add(project)
        session.commit()
        session.refresh(project)

        competitor = CompetitorDomain(project_id=project.id, domain="old-domain.com")
        session.add(competitor)
        session.commit()
        session.refresh(competitor)

        result = update_competitor(
            project_id=project.id,
            competitor_id=competitor.id,
            payload=CompetitorDomainUpdate(domain="  NewDomain.COM  "),
            session=session,
            _=None,
        )

        assert result.id == competitor.id
        assert result.project_id == project.id
        assert result.domain == "newdomain.com"


def test_update_competitor_rejects_duplicate_domain_in_project():
    with _build_session() as session:
        project = Project(name="Demo", domain="example.com")
        session.add(project)
        session.commit()
        session.refresh(project)

        first = CompetitorDomain(project_id=project.id, domain="first.com")
        second = CompetitorDomain(project_id=project.id, domain="second.com")
        session.add(first)
        session.add(second)
        session.commit()
        session.refresh(second)

        with pytest.raises(HTTPException) as exc_info:
            update_competitor(
                project_id=project.id,
                competitor_id=second.id,
                payload=CompetitorDomainUpdate(domain=" First.COM "),
                session=session,
                _=None,
            )

        assert exc_info.value.status_code == 400
        assert exc_info.value.detail == ErrorCode.COMPETITOR_DOMAIN_ALREADY_EXISTS


def test_update_competitor_returns_404_for_cross_project_competitor():
    with _build_session() as session:
        first_project = Project(name="Project A", domain="a.com")
        second_project = Project(name="Project B", domain="b.com")
        session.add(first_project)
        session.add(second_project)
        session.commit()
        session.refresh(first_project)
        session.refresh(second_project)

        competitor = CompetitorDomain(project_id=second_project.id, domain="competitor.com")
        session.add(competitor)
        session.commit()
        session.refresh(competitor)

        with pytest.raises(HTTPException) as exc_info:
            update_competitor(
                project_id=first_project.id,
                competitor_id=competitor.id,
                payload=CompetitorDomainUpdate(domain="updated.com"),
                session=session,
                _=None,
            )

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == ErrorCode.COMPETITOR_NOT_FOUND
