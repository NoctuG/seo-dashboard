from __future__ import annotations

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlmodel import Session, select

from app.db import engine
from app.models import ReportSchedule, ReportTemplate
from app.metrics import SCHEDULER_JOBS_TOTAL, SCHEDULER_RELOADS_TOTAL, SCHEDULER_RETRIES_TOTAL
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
        SCHEDULER_RELOADS_TOTAL.inc()
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

    def get_status(self) -> dict[str, int | bool]:
        return {
            "running": self.scheduler.running,
            "job_count": len(self.scheduler.get_jobs()) if self.scheduler.running else 0,
        }


scheduler_service = SchedulerService()
