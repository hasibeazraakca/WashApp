# WashApp Backend — Render deploy (web service: API + webhook'lar)
# Worker ayni image, farkli start komutu: python -m app.worker
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

WORKDIR /app

# Sistem bagimliliklari (asyncpg/cryptography wheel'leri genelde yeterli; libpq opsiyonel)
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY app ./app

# Render health check: /healthz (DB yoksa bile 200)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://localhost:${PORT}/healthz || exit 1

# Web service start komutu (Render Start Command olarak da verilebilir):
#   gunicorn -k uvicorn.workers.UvicornWorker app.main:app --bind 0.0.0.0:$PORT
# Worker icin Render Background Worker'da Start Command:
#   python -m app.worker
CMD ["sh", "-c", "gunicorn -k uvicorn.workers.UvicornWorker app.main:app --bind 0.0.0.0:${PORT} --workers 2 --timeout 30"]
