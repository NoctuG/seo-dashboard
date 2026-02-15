import smtplib
from email.message import EmailMessage

from app.config import settings


class EmailService:
    def _assert_configured(self) -> None:
        if not settings.SMTP_HOST or not settings.SMTP_FROM:
            raise RuntimeError("SMTP is not configured")

    def send_email(self, to_email: str, subject: str, text_body: str, html_body: str | None = None) -> None:
        self._assert_configured()

        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = settings.SMTP_FROM
        message["To"] = to_email
        message.set_content(text_body)
        if html_body:
            message.add_alternative(html_body, subtype="html")

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as smtp:
            if settings.SMTP_USE_TLS:
                smtp.starttls()
            if settings.SMTP_USER:
                smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            smtp.send_message(message)


email_service = EmailService()
