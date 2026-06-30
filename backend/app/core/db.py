"""Postgres baglanti havuzu — asyncpg + Supavisor transaction pooler.

KRITIK (03-yazilim-mimarisi.md §2.5, 02-veri-mimarisi.md §8.5):
- Supavisor TRANSACTION pooler, port 6543 ZORUNLU.
- statement_cache_size=0  -> transaction-mode pooler prepared statement desteklemez.
- pool kucuk (max 5) -> pooler zaten multiplexliyor.

FastAPI service_role ile baglanir (money.* / audit.* RLS bypass), is kurali
backend'de zorlanir. Mobil app bu havuzu ASLA kullanmaz.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

import asyncpg

from app.core.config import settings

logger = logging.getLogger(__name__)

# Modul-seviyesi tekil havuz (lifespan icinde init/close edilir).
_pool: asyncpg.Pool | None = None


async def init_pool() -> asyncpg.Pool | None:
    """Havuzu olustur. DATABASE_URL yoksa None doner (healthz yine de calisir)."""
    global _pool
    if _pool is not None:
        return _pool
    if not settings.database_url:
        logger.warning("DATABASE_URL tanimsiz — DB havuzu olusturulmadi (degraded mod).")
        return None
    try:
        _pool = await asyncpg.create_pool(
            dsn=settings.database_url,
            min_size=settings.db_pool_min_size,
            max_size=settings.db_pool_max_size,
            # Supavisor transaction pooler uyumu: prepared statement cache KAPALI.
            statement_cache_size=0,
            # Server-side application_name (denetim/izleme).
            server_settings={"application_name": "washapp-api"},
            # Pooler arkasinda her acquire'da hafif saglik kontrolu pahaliya patlar;
            # bunun yerine command_timeout ile asili kalmayi onleriz.
            command_timeout=30,
        )
        logger.info(
            "DB havuzu hazir (Supavisor pooler, max_size=%s).",
            settings.db_pool_max_size,
        )
    except Exception:  # noqa: BLE001 — baslangic basarisiz olsa bile servis ayakta kalsin
        logger.exception("DB havuzu olusturulamadi — degraded modda devam ediliyor.")
        _pool = None
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("DB havuzu kapatildi.")


def get_pool() -> asyncpg.Pool:
    """Aktif havuzu dondur; yoksa hata firlat (DB gerektiren endpoint'lerde)."""
    if _pool is None:
        raise RuntimeError("DB havuzu hazir degil (DATABASE_URL eksik olabilir).")
    return _pool


async def healthcheck() -> bool:
    """Basit SELECT 1 — /healthz icin. Havuz yoksa False (servis yine 200 doner)."""
    if _pool is None:
        return False
    try:
        async with _pool.acquire() as conn:
            return (await conn.fetchval("SELECT 1")) == 1
    except Exception:  # noqa: BLE001
        logger.exception("DB healthcheck basarisiz.")
        return False


@asynccontextmanager
async def acquire() -> AsyncIterator[asyncpg.Connection]:
    """Havuzdan baglanti al (FastAPI dependency veya repo katmaninda kullanilir)."""
    pool = get_pool()
    async with pool.acquire() as conn:
        yield conn


@asynccontextmanager
async def transaction() -> AsyncIterator[asyncpg.Connection]:
    """Atomik transaction — webhook/ledger/durum gecisi tek blokta (§4.2)."""
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            yield conn


# FastAPI dependency: endpoint imzasinda `conn: asyncpg.Connection = Depends(get_db)`.
async def get_db() -> AsyncIterator[asyncpg.Connection]:
    async with acquire() as conn:
        yield conn
