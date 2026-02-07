from fastapi import APIRouter, Depends, HTTPException, Body
from sqlmodel import Session
from app.db import get_session
from app.models import Issue, IssueStatus
from app.schemas import IssueRead

router = APIRouter()

@router.patch("/{issue_id}/status", response_model=IssueRead)
def update_issue_status(issue_id: int, status: IssueStatus, session: Session = Depends(get_session)):
    issue = session.get(Issue, issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    issue.status = status
    session.add(issue)
    session.commit()
    session.refresh(issue)
    return issue
