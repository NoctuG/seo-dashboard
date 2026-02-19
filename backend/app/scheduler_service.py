from __future__ import annotations

import json
import logging
from datetime import datetime
from time import perf_counter

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlmodel import Session, select

from app.db import engine
from app.metrics import (
    KEYWORD_RANK_SCHEDULE_DURATION_SECONDS,
    KEYWORD_RANK_SCHEDULE_RUNS_TOTAL,
    SCHEDULER_JOBS_TOTAL,
    SCHEDULER_RELOADS_TOTAL,
    SCHEDULER_RETRIES_TOTAL,
)
from app.models import (
    CompetitorDomain,
    Keyword,
    KeywordRankSchedule,
    KeywordScheduleFrequency,
    Project,
    RankHistory,
    ReportSchedule,
    ReportTemplate,
)
from app.report_service import report_service
from app.serp_service import check_keyword_rank
from app.webhook_service import (
    WEBHOOK_EVENT_RANK_DROPPED_SIGNIFICANTLY,
    is_significant_rank_drop,
    webhook_service,
)

logger = logging.getLogger(__name__)


class SchedulerService:
    def __init__(self) -> None:
        self.scheduler = BackgroundScheduler()

    def start(self) -> None:
        if not self.scheduler.running:
            self.scheduler.start()
        self.reload_jobs()

    def shutdown(self) -> None:
        if self.scheduler.running:
            self.scheduler.shutdown(wait=False)

    def reload_jobs(self) -> None:
        if not self.scheduler.running:
            return
        SCHEDULER_RELOADS_TOTAL.inc()
        self.scheduler.remove_all_jobs()
        with Session(engine) as session:
            report_schedules = session.exec(select(ReportSchedule).where(ReportSchedule.active == True)).all()  # noqa: E712
            for schedule in report_schedules:
                self._upsert_report_job(schedule)

            keyword_schedules = session.exec(select(KeywordRankSchedule).where(KeywordRankSchedule.active == True)).all()  # noqa: E712
            for schedule in keyword_schedules:
                self._upsert_keyword_rank_job(schedule)

    def _upsert_report_job(self, schedule: ReportSchedule) -> None:
        try:
            minute, hour, day, month, day_of_week = schedule.cron_expression.split()
        except ValueError:
            return
        trigger = CronTrigger(
            minute=minute,
            hour=hour,
            day=day,
            month=month,
            day_of_week=day_of_week,
            timezone=schedule.timezone,
        )
        self.scheduler.add_job(
            self.run_schedule,
            trigger=trigger,
            id=f"report_schedule_{schedule.id}",
            replace_existing=True,
            args=[schedule.id],
        )

    def _upsert_keyword_rank_job(self, schedule: KeywordRankSchedule) -> None:
        if schedule.frequency == KeywordScheduleFrequency.WEEKLY:
            trigger = CronTrigger(
                minute=0,
                hour=schedule.hour,
                day_of_week=str(schedule.day_of_week if schedule.day_of_week is not None else 0),
                timezone=schedule.timezone,
            )
        else:
            trigger = CronTrigger(
                minute=0,
                hour=schedule.hour,
                timezone=schedule.timezone,
            )

        self.scheduler.add_job(
            self.run_keyword_rank_schedule,
            trigger=trigger,
            id=f"keyword_rank_schedule_{schedule.id}",
            replace_existing=True,
            args=[schedule.id],
        )

    def run_schedule(self, schedule_id: int) -> None:
        with Session(engine) as session:
            schedule = session.get(ReportSchedule, schedule_id)
            if not schedule or not schedule.active:
                SCHEDULER_JOBS_TOTAL.labels(result="skipped").inc()
                return
            template = session.get(ReportTemplate, schedule.template_id)
            if not template:
                SCHEDULER_JOBS_TOTAL.labels(result="failed").inc()
                report_service.create_delivery_log(
                    session,
                    project_id=schedule.project_id,
                    template_id=schedule.template_id,
                    schedule_id=schedule.id,
                    recipient_email=schedule.recipient_email,
                    export_format="csv",
                    retries=0,
                    status="failed",
                    error_message="ValueError: Template not found",
                )
                return

            retries = 0
            while retries <= schedule.retry_limit:
                try:
                    payload = report_service.build_report_payload(session, schedule.project_id, template)
                    report_content, media_type = report_service.render(payload, "csv")
                    report_service.send_report_email(
                        recipient_email=schedule.recipient_email,
                        payload=payload,
                        report_content=report_content,
                        media_type=media_type,
                        export_format="csv",
                    )
                    report_service.create_delivery_log(
                        session,
                        project_id=schedule.project_id,
                        template_id=template.id,
                        schedule_id=schedule.id,
                        recipient_email=schedule.recipient_email,
                        export_format="csv",
                        retries=retries,
                        status="success",
                    )
                    session.commit()
                    SCHEDULER_JOBS_TOTAL.labels(result="success").inc()
                    report_service.dispatch_report_generated(
                        session,
                        project_id=schedule.project_id,
                        template_id=template.id,
                        export_format="csv",
                        trigger="scheduled",
                    )
                    return
                except Exception as exc:  # noqa: BLE001
                    retries += 1
                    SCHEDULER_RETRIES_TOTAL.inc()
                    if retries > schedule.retry_limit:
                        SCHEDULER_JOBS_TOTAL.labels(result="failed").inc()
                        report_service.create_delivery_log(
                            session,
                            project_id=schedule.project_id,
                            template_id=schedule.template_id,
                            schedule_id=schedule.id,
                            recipient_email=schedule.recipient_email,
                            export_format="csv",
                            retries=schedule.retry_limit,
                            status="failed",
                            error_message=report_service.format_delivery_error(exc),
                        )
                        return

    def run_keyword_rank_schedule(self, schedule_id: int) -> None:
        started = perf_counter()
        with Session(engine) as session:
            schedule = session.get(KeywordRankSchedule, schedule_id)
            if not schedule or not schedule.active:
                KEYWORD_RANK_SCHEDULE_RUNS_TOTAL.labels(result="skipped").inc()
                return

            project = session.get(Project, schedule.project_id)
            if not project:
                KEYWORD_RANK_SCHEDULE_RUNS_TOTAL.labels(result="failed").inc()
                logger.warning("Keyword rank schedule %s skipped: project not found", schedule_id)
                return

            competitors = session.exec(
                select(CompetitorDomain).where(CompetitorDomain.project_id == schedule.project_id)
            ).all()
            competitor_domains = [item.domain for item in competitors]

            keywords = session.exec(select(Keyword).where(Keyword.project_id == schedule.project_id)).all()
            success_count = 0
            failed_count = 0

            for keyword in keywords:
                gl = (keyword.market or project.default_gl or "us").strip().lower()
                hl = (keyword.locale or project.default_hl or "en").strip().lower()
                try:
                    result = check_keyword_rank(keyword.term, project.domain, competitor_domains, gl=gl, hl=hl)
                    now = datetime.utcnow()
                    previous_rank = keyword.current_rank
                    keyword.current_rank = result.rank
                    keyword.last_checked = now
                    keyword.serp_features_json = json.dumps(result.serp_features, ensure_ascii=False)
                    session.add(keyword)
                    session.add(
                        RankHistory(
                            keyword_id=keyword.id,
                            rank=result.rank,
                            url=result.url,
                            gl=gl,
                            hl=hl,
                            checked_at=now,
                        )
                    )
                    if is_significant_rank_drop(previous_rank, result.rank):
                        webhook_service.dispatch_event(
                            session,
                            WEBHOOK_EVENT_RANK_DROPPED_SIGNIFICANTLY,
                            {
                                "project_id": schedule.project_id,
                                "keyword_id": keyword.id,
                                "keyword_term": keyword.term,
                                "previous_rank": previous_rank,
                                "current_rank": result.rank,
                                "drop": result.rank - previous_rank,
                                "trigger": "keyword_schedule",
                            },
                        )
                    success_count += 1
                except Exception:  # noqa: BLE001
                    failed_count += 1
                    logger.exception(
                        "Keyword rank schedule %s failed for keyword %s", schedule_id, keyword.id
                    )

            schedule.last_run_at = datetime.utcnow()
            schedule.updated_at = datetime.utcnow()
            session.add(schedule)
            session.commit()

            duration = perf_counter() - started
            KEYWORD_RANK_SCHEDULE_DURATION_SECONDS.observe(duration)
            if failed_count > 0:
                KEYWORD_RANK_SCHEDULE_RUNS_TOTAL.labels(result="partial").inc()
            else:
                KEYWORD_RANK_SCHEDULE_RUNS_TOTAL.labels(result="success").inc()

            logger.info(
                "Keyword rank schedule %s finished project=%s success=%s failed=%s duration=%.3fs",
                schedule_id,
                schedule.project_id,
                success_count,
                failed_count,
                duration,
            )

    def get_status(self) -> dict[str, int | bool]:
        return {
            "running": self.scheduler.running,
            "job_count": len(self.scheduler.get_jobs()) if self.scheduler.running else 0,
        }


scheduler_service = SchedulerService()
