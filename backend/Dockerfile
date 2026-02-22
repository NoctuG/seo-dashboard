# ---- Stage 1: Build dependencies ----
FROM python:3.12-slim AS builder

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ---- Stage 2: Runtime ----
FROM python:3.12-slim

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy application code
COPY . .

# Create directories for SQLite database and backups
RUN mkdir -p /data /data/backups

# Default database path points to the persistent volume
ENV DATABASE_URL=sqlite:////data/seo_tool.db

EXPOSE 28000

# Run preflight checks, then migrations, then start the server.
# Preflight uses --quick to avoid needing a live DB connection before migrations.
CMD ["sh", "-c", "cd /app && python -m app.preflight --quick && alembic upgrade head && python -m app.preflight && uvicorn app.main:app --host 0.0.0.0 --port 28000"]
