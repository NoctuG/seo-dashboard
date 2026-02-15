from __future__ import annotations

from datetime import datetime
from babel.dates import format_datetime
from babel.numbers import format_decimal
import csv
import io
import json
from typing import Any, Dict, Iterable, List, Literal, Tuple

from sqlmodel import Session, select

from app.email_service import email_service
from app.models import Project, ReportTemplate, ReportDeliveryLog


class ReportService:
    def build_report_payload(self, session: Session, project_id: int, template: ReportTemplate) -> Dict[str, Any]:
        project = session.get(Project, project_id)
        if not project:
            raise ValueError("Project not found")

        try:
            indicators = json.loads(template.indicators_json or "[]")
        except json.JSONDecodeError:
            indicators = []

        try:
            brand_styles = json.loads(template.brand_styles_json or "{}")
        except json.JSONDecodeError:
            brand_styles = {}

        latest_logs = session.exec(
            select(ReportDeliveryLog)
            .where(ReportDeliveryLog.project_id == project_id)
            .order_by(ReportDeliveryLog.created_at.desc())
            .limit(5)
        ).all()

        return {
            "project": {
                "id": project.id,
                "name": project.name,
                "domain": project.domain,
            },
            "template": {
                "id": template.id,
                "name": template.name,
                "time_range": template.time_range,
                "locale": template.locale,
                "indicators": indicators,
                "brand_styles": brand_styles,
            },
            "generated_at": datetime.utcnow().isoformat(),
            "ops": {
                "recent_delivery_count": len(latest_logs),
                "recent_failures": len([log for log in latest_logs if log.status == "failed"]),
            },
        }

    def _format_value(self, value: Any, locale: str) -> str:
        if isinstance(value, (int, float)):
            return format_decimal(value, locale=locale)
        if isinstance(value, str):
            try:
                parsed = datetime.fromisoformat(value)
                return format_datetime(parsed, locale=locale)
            except ValueError:
                return value
        return str(value)

    def render_csv(self, payload: Dict[str, Any]) -> bytes:
        output = io.StringIO()
        writer = csv.writer(output)
        locale = payload.get("template", {}).get("locale", "en-US")
        self._write_csv_section(writer, "project", payload.get("project", {}), locale)
        self._write_csv_section(writer, "template", payload.get("template", {}), locale)
        self._write_csv_section(writer, "ops", payload.get("ops", {}), locale)
        writer.writerow(["generated_at", self._format_value(payload.get("generated_at"), locale)])
        return output.getvalue().encode("utf-8")

    def _write_csv_section(self, writer: csv.writer, section_name: str, data: Dict[str, Any], locale: str) -> None:
        for key, value in data.items():
            writer.writerow([section_name, key, self._stringify(value, locale)])

    def _stringify(self, value: Any, locale: str) -> str:
        if isinstance(value, dict):
            return json.dumps({k: self._format_value(v, locale) for k, v in value.items()}, ensure_ascii=False)
        if isinstance(value, (list, tuple)):
            return json.dumps([self._format_value(v, locale) for v in value], ensure_ascii=False)
        return self._format_value(value, locale)

    def render_pdf(self, payload: Dict[str, Any]) -> bytes:
        locale = payload.get("template", {}).get("locale", "en-US")
        lines = [
            f"Report: {payload['template']['name']}",
            f"Project: {payload['project']['name']} ({payload['project']['domain']})",
            f"Time range: {payload['template']['time_range']}",
            f"Indicators: {', '.join(payload['template']['indicators']) or '-'}",
            f"Generated at: {self._format_value(payload['generated_at'], locale)}",
        ]
        return self._minimal_pdf(lines)

    def _minimal_pdf(self, lines: Iterable[str]) -> bytes:
        escaped = "\\n".join(line.replace("(", "\\(").replace(")", "\\)") for line in lines)
        content_stream = f"BT /F1 12 Tf 50 760 Td ({escaped}) Tj ET".encode("latin-1", errors="ignore")

        objects = [
            b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
            b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
            b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n",
            b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
            f"5 0 obj << /Length {len(content_stream)} >> stream\n".encode("latin-1") + content_stream + b"\nendstream endobj\n",
        ]

        buffer = io.BytesIO()
        buffer.write(b"%PDF-1.4\n")
        offsets: List[int] = [0]
        for obj in objects:
            offsets.append(buffer.tell())
            buffer.write(obj)

        xref_start = buffer.tell()
        buffer.write(f"xref\n0 {len(objects) + 1}\n".encode("latin-1"))
        buffer.write(b"0000000000 65535 f \n")
        for offset in offsets[1:]:
            buffer.write(f"{offset:010d} 00000 n \n".encode("latin-1"))

        buffer.write(
            f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_start}\n%%EOF".encode("latin-1")
        )
        return buffer.getvalue()

    def render(self, payload: Dict[str, Any], export_format: str) -> Tuple[bytes, str]:
        fmt = export_format.lower()
        if fmt == "csv":
            return self.render_csv(payload), "text/csv"
        if fmt == "pdf":
            return self.render_pdf(payload), "application/pdf"
        raise ValueError("Unsupported format")

    def _build_report_email_content(self, payload: Dict[str, Any], export_format: str) -> tuple[str, str, str]:
        project_name = payload.get("project", {}).get("name", "Unknown Project")
        template_name = payload.get("template", {}).get("name", "Report")
        generated_at = payload.get("generated_at", datetime.utcnow().isoformat())
        lower_format = export_format.lower()

        subject = f"[{project_name}] {template_name} ({lower_format.upper()})"
        text_body = (
            f"Your scheduled SEO report is ready.\n\n"
            f"Project: {project_name}\n"
            f"Template: {template_name}\n"
            f"Format: {lower_format.upper()}\n"
            f"Generated at (UTC): {generated_at}\n"
        )
        filename = f"seo-report-{project_name.lower().replace(' ', '-')}-{payload.get('template', {}).get('id', 'template')}.{lower_format}"
        return subject, text_body, filename

    def format_delivery_error(self, error: Exception) -> str:
        details = " ".join(str(error).split())
        message = f"{error.__class__.__name__}: {details}" if details else error.__class__.__name__
        return message[:500]

    def create_delivery_log(
        self,
        session: Session,
        *,
        project_id: int,
        template_id: int | None,
        schedule_id: int | None,
        recipient_email: str | None,
        export_format: str,
        retries: int,
        status: Literal["success", "failed"],
        error_message: str | None = None,
    ) -> ReportDeliveryLog:
        log = ReportDeliveryLog(
            project_id=project_id,
            template_id=template_id,
            schedule_id=schedule_id,
            format=export_format.lower(),
            status=status,
            retries=retries,
            recipient_email=recipient_email,
            error_message=error_message,
            created_at=datetime.utcnow(),
        )
        session.add(log)
        session.commit()
        return log

    def send_report_email(
        self,
        *,
        recipient_email: str,
        payload: Dict[str, Any],
        report_content: bytes,
        media_type: str,
        export_format: str,
    ) -> None:
        subject, text_body, filename = self._build_report_email_content(payload, export_format)
        email_service.send_email(
            to_email=recipient_email,
            subject=subject,
            text_body=text_body,
            attachments=[(filename, report_content, media_type)],
        )


report_service = ReportService()
