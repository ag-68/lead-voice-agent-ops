FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATABASE_URL=sqlite+aiosqlite:////tmp/leads.db \
    MLFLOW_TRACKING_URI=file:///tmp/mlruns \
    ACTIVE_PROMPT_VERSION=v1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
# MLOps assets (copied into build context before deploy when missing)
COPY prompts ./prompts
COPY evals ./evals

EXPOSE 8080
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
