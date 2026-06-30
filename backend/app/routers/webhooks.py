"""PSP webhook endpoint'leri — Iyzico (idempotent + HMAC) (§4.2).

KRITIK (03-yazilim-mimarisi.md §4.2, 02-veri-mimarisi.md §4.2):
- HMAC imza dogrulamasi HER webhook'ta ZORUNLU (sahte capture/payout engeli).
- Idempotency: money.psp_webhook_events unique(psp, psp_event_id) -> cift event no-op.
- Ledger + durum gecisi + isaretleme TEK transaction (kismi basari yok).
- 2 sn'de yanit don; agir is (push/payout) worker'a kuyruga.

HMAC dogrulama + idempotency iskeleti GERCEK (stub degil); event isleme TODO(Faz-2).
"""
from __future__ import annotations

import hashlib
import hmac
import logging

import asyncpg
import orjson
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status

from app.core.config import settings
from app.core.db import get_db
from app.schemas import ErrorResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def verify_iyzico_hmac(raw_body: bytes, signature: str | None) -> bool:
    """Iyzico X-IYZ-SIGNATURE HMAC-SHA256 dogrulama (zaman-sabit karsilastirma).

    Not: Iyzico imza semasi entegrasyon dokumanina gore netlesir (bazi urunlerde
    base64, bazilarinda hex; bazen secret+body, bazen secret+belirli alanlar).
    Burada en yaygin sema (HMAC-SHA256(secret, raw_body) -> hex) varsayilmistir;
    TODO(Faz-2): Iyzico Pazaryeri webhook dokumaniyla birebir teyit + alan secimi.
    """
    if not signature:
        return False
    if not settings.iyzico_webhook_secret:
        logger.error("IYZICO_WEBHOOK_SECRET tanimsiz — webhook dogrulanamaz.")
        return False
    expected = hmac.new(
        settings.iyzico_webhook_secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()
    # compare_digest -> timing attack korumasi
    return hmac.compare_digest(expected, signature.strip().lower())


async def _insert_webhook_event_if_new(
    db: asyncpg.Connection,
    *,
    psp: str,
    psp_event_id: str,
    event_type: str,
    order_id: str | None,
    raw_payload: bytes,
    imza_dogru: bool,
) -> bool:
    """money.psp_webhook_events'e idempotent INSERT.

    unique(psp, psp_event_id) cakisirsa False (zaten islendi -> no-op).
    """
    row = await db.fetchrow(
        """
        INSERT INTO money.psp_webhook_events
            (psp, psp_event_id, event_type, order_id, raw_payload, imza_dogru)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6)
        ON CONFLICT (psp, psp_event_id) DO NOTHING
        RETURNING id
        """,
        psp,
        psp_event_id,
        event_type,
        order_id,
        raw_payload.decode("utf-8"),
        imza_dogru,
    )
    return row is not None


async def _mark_processed(db: asyncpg.Connection, psp: str, psp_event_id: str) -> None:
    await db.execute(
        """
        UPDATE money.psp_webhook_events
        SET islendi = true, islendi_at = now()
        WHERE psp = $1 AND psp_event_id = $2
        """,
        psp,
        psp_event_id,
    )


@router.post(
    "/iyzico",
    responses={401: {"model": ErrorResponse}},
)
async def iyzico_webhook(
    request: Request,
    x_iyz_signature: str | None = Header(default=None, alias="X-IYZ-SIGNATURE"),
    db: asyncpg.Connection = Depends(get_db),
) -> dict:
    """Iyzico odeme webhook — idempotent + HMAC dogrulama (§4.2)."""
    raw = await request.body()

    # 1) HMAC imza dogrula (sahte bildirimi engelle)
    if not verify_iyzico_hmac(raw, x_iyz_signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "gecersiz_imza", "detay": "HMAC dogrulanamadi"},
        )

    # 2) Payload parse
    try:
        evt = orjson.loads(raw)
    except orjson.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "gecersiz_payload", "detay": "JSON parse hatasi"},
        ) from exc

    # TODO(Faz-2): Iyzico payload alan adlarini dokumanla esle (asagisi varsayim).
    psp_event_id = str(evt.get("iyziEventId") or evt.get("eventId") or evt.get("token") or "")
    event_type = str(evt.get("iyziEventType") or evt.get("eventType") or evt.get("status") or "unknown")
    order_id = evt.get("conversationId") or evt.get("order_id")

    if not psp_event_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "event_id_yok", "detay": "psp_event_id cikarilamadi"},
        )

    # 3) IDEMPOTENCY: ilk kez mi? (atomik INSERT ... ON CONFLICT DO NOTHING)
    async with db.transaction():
        inserted = await _insert_webhook_event_if_new(
            db,
            psp="iyzico",
            psp_event_id=psp_event_id,
            event_type=event_type,
            order_id=order_id,
            raw_payload=raw,
            imza_dogru=True,
        )
        if not inserted:
            # Daha once islendi -> at-least-once guvenli no-op.
            return {"status": "duplicate_ignored"}

        # 4) Event isle (capture/refund/payout ledger satirlari) — ayni transaction.
        # TODO(Faz-2): handle_payment_event(evt): auth_success/capture/refund/payout_done
        #   -> ledger + escrow_holds + orders.status; agir is (push) worker kuyruguna.
        await _mark_processed(db, "iyzico", psp_event_id)

    return {"status": "ok"}
