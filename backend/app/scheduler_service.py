from __future__ import annotations

from datetime import datetime
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlmodel import Session, select

from app.db import engine
from app.models import ReportSchedule, ReportTemplate, ReportDeliveryLog
from app.report_service import report_service


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
        self.scheduler.remove_all_jobs()
        with Session(engine) as session:
            schedules = session.exec(select(ReportSchedule).where(ReportSchedule.active == True)).all()  # noqa: E712
            for schedule in schedules:
                self._upsert_job(schedule)

    def _upsert_job(self, schedule: ReportSchedule) -> None:
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

    def run_schedule(self, schedule_id: int) -> None:
        with Session(engine) as session:
            schedule = session.get(ReportSchedule, schedule_id)
            if not schedule or not schedule.active:
                return
            template = session.get(ReportTemplate, schedule.template_id)
            if not template:
                self._log_failure(session, schedule, "Template not found", retries=0)
                return

            retries = 0
            while retries <= schedule.retry_limit:
                try:
                    payload = report_service.build_report_payload(session, schedule.project_id, template)
                    report_service.render(payload, "csv")
                    log = ReportDeliveryLog(
                        project_id=schedule.project_id,
                        template_id=template.id,
                        schedule_id=schedule.id,
                        format="csv",
                        status="success",
                        retries=retries,
                        recipient_email=schedule.recipient_email,
                    )
                    session.add(log)
                    session.commit()
                    return
                except Exception as exc:  # noqa: BLE001
                    retries += 1
                    if retries > schedule.retry_limit:
                        self._log_failure(session, schedule, str(exc), retries=schedule.retry_limit)
                        return

    def _log_failure(self, session: Session, schedule: ReportSchedule, message: str, retries: int) -> None:
        log = ReportDeliveryLog(
            project_id=schedule.project_id,
            template_id=schedule.template_id,
            schedule_id=schedule.id,
            format="csv",
            status="failed",
            retries=retries,
            recipient_email=schedule.recipient_email,
            error_message=message[:500],
            created_at=datetime.utcnow(),
        )
        session.add(log)
        session.commit()

    def get_status(self) -> dict[str, int | bool]:
        return {
            "running": self.scheduler.running,
            "job_count": len(self.scheduler.get_jobs()) if self.scheduler.running else 0,
        }


scheduler_service = SchedulerService()
