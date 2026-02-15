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

# Create directory for SQLite database persistence
RUN mkdir -p /data

# Default database path points to the persistent volume
ENV DATABASE_URL=sqlite:////data/seo_tool.db

EXPOSE 8000

# Run migrations then start the server
CMD ["sh", "-c", "cd /app && alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
