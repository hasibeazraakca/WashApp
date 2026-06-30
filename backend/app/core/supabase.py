"""Supabase service_role client — Storage signed URL + Auth admin.

03-yazilim-mimarisi.md §2.3 / §7.4:
- Foto/KYC goruntuleme -> 60 sn imzali URL (kalici public URL ASLA).
- Rol claim'i (app_metadata.role) yalnizca buradan (service_role) yazilir.

service_role anahtari Render env'de gizli; mobil app bu client'a ASLA erisemez.
"""
from __future__ import annotations

import logging
from functools import lru_cache

from app.core.config import settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_service_client():
    """Supabase service_role client (singleton).

    supabase-py senkron client; FastAPI async endpoint'lerinde kisa Storage/Auth
    cagrilari icin kabul edilebilir. Yogun kullanimda run_in_executor TODO(Faz-2).
    """
    from supabase import create_client  # lazy import (test/CI'da opsiyonel)

    if not settings.supabase_url or not settings.supabase_service_role_key:
        logger.warning("Supabase service client yapilandirilmadi (URL/key eksik).")
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


# --- Storage yardimcilari (evidence / evidence-kyc private bucket) ---

EVIDENCE_BUCKET = "evidence"
EVIDENCE_KYC_BUCKET = "evidence-kyc"


def create_signed_upload_url(bucket: str, path: str) -> dict:
    """Imzali YUKLEME URL'i (istemci dogrudan Storage'a PUT eder).

    PR-3 akisi: istemci hash hesaplar -> bu URL'e yukler -> /evidence/confirm
    ile sunucu re-hash dogrular.
    """
    client = get_service_client()
    # supabase-py Storage API: create_signed_upload_url(path)
    return client.storage.from_(bucket).create_signed_upload_url(path)


def create_signed_url(bucket: str, path: str, expires_in: int | None = None) -> str:
    """Imzali GORUNTULEME URL'i (60 sn TTL — §7.4)."""
    ttl = expires_in or settings.evidence_signed_url_ttl
    client = get_service_client()
    res = client.storage.from_(bucket).create_signed_url(path, ttl)
    return res.get("signedURL") or res.get("signed_url", "")


async def download_bytes(bucket: str, path: str) -> bytes:
    """Storage'tan dosya indir (sunucu re-hash dogrulamasi icin)."""
    client = get_service_client()
    # TODO(Faz-1): senkron cagriyi executor'a tasi (yuksek hacimde event loop blok).
    return client.storage.from_(bucket).download(path)


# --- Auth admin (rol claim yazma) ---


def set_user_role(user_id: str, role: str) -> None:
    """app_metadata.role yaz — yalnizca onboarding onayinda backend cagirir (§7.1)."""
    client = get_service_client()
    # TODO(Faz-0): admin update_user_by_id ile app_metadata guncelle.
    client.auth.admin.update_user_by_id(user_id, {"app_metadata": {"role": role}})
