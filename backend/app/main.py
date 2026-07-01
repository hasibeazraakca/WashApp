"""WashApp API — FastAPI uygulama girisi (Render web service).

03-yazilim-mimarisi.md §2.2: 1 web service (API + webhook'lar). Worker ayri
(app/worker.py). DB yoksa /healthz yine de calisir (degraded mod).
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse

from app import __version__
from app.core.config import settings
from app.core.db import close_pool, healthcheck, init_pool
from app.routers import (
    campaigns,
    dispatch,
    disputes,
    evidence,
    me,
    orders,
    payments,
    providers,
    services,
    subscriptions,
    webhooks,
)

logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))
logger = logging.getLogger("washapp")


def _init_sentry() -> None:
    if not settings.sentry_dsn:
        return
    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.app_env,
        traces_sample_rate=0.1 if settings.is_prod else 1.0,
        # PII scrubbing: plaka/telefon log'lara sizmasin (§7.5).
        send_default_pii=False,
    )
    logger.info("Sentry baslatildi (env=%s).", settings.app_env)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Baslangic: Sentry + DB havuzu. Kapanis: havuzu kapat."""
    _init_sentry()
    await init_pool()  # DATABASE_URL yoksa None — servis yine ayakta.
    logger.info("WashApp API hazir (v%s, env=%s).", __version__, settings.app_env)
    try:
        yield
    finally:
        await close_pool()


app = FastAPI(
    title="WashApp API",
    version=__version__,
    description="Kapida mobil oto yikama marketplace — FastAPI backend.",
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
)

# --- CORS (yalniz app origin'leri; native app bos liste — §7.5) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list or ["*"] if not settings.is_prod else settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- v1 router'lari mount ---
API_V1 = "/api/v1"
for module in (
    me,
    orders,
    evidence,
    payments,
    webhooks,
    dispatch,
    disputes,
    subscriptions,
    providers,
    campaigns,
    services,
):
    app.include_router(module.router, prefix=API_V1)


# --- Saglik & kok ---
@app.get("/healthz", tags=["meta"])
async def healthz() -> dict:
    """Render health check. DB yoksa bile 200 doner (db alani durumu bildirir)."""
    db_ok = await healthcheck()
    return {
        "status": "ok",
        "version": __version__,
        "env": settings.app_env,
        "db": "up" if db_ok else "down",
    }


@app.get("/", tags=["meta"])
async def root() -> dict:
    return {"service": "washapp-api", "version": __version__, "docs": "/docs"}


# --- request-id orta katmani (Sentry/izleme korelasyonu) ---
@app.middleware("http")
async def add_request_id(request: Request, call_next):
    import uuid

    rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex
    response = await call_next(request)
    response.headers["X-Request-ID"] = rid
    return response
