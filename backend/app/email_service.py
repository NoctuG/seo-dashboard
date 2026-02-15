import smtplib
from email.message import EmailMessage

from app.runtime_settings import get_runtime_settings


class EmailService:
    def _assert_configured(self) -> None:
        runtime = get_runtime_settings()
        if not runtime.smtp_host or not runtime.smtp_from:
            raise RuntimeError("SMTP is not configured")

    def send_email(self, to_email: str, subject: str, text_body: str, html_body: str | None = None) -> None:
        self._assert_configured()

        message = EmailMessage()
        message["Subject"] = subject
        runtime = get_runtime_settings()
        message["From"] = runtime.smtp_from
        message["To"] = to_email
        message.set_content(text_body)
        if html_body:
            message.add_alternative(html_body, subtype="html")

        with smtplib.SMTP(runtime.smtp_host, runtime.smtp_port, timeout=30) as smtp:
            if runtime.smtp_use_tls:
                smtp.starttls()
            if runtime.smtp_user:
                smtp.login(runtime.smtp_user, runtime.smtp_password)
            smtp.send_message(message)


email_service = EmailService()
