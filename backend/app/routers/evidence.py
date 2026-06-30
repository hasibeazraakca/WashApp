"""Fotoğraf kanit endpoint'leri — in-app kamera anti-fraud omurgasi (PR-2/3/4).

03-yazilim-mimarisi.md §3: galeri yuklemesi imkansiz, istemci+sunucu SHA-256,
GPS damgasi, append-only. Sunucu re-hash eslesmezse 409 (kurcalama reddi).

Akis (§3.2):
  varildi  -> 6 'oncesi' aci  -> oncesi_foto_ok
  yikama   -> 6 'sonrasi' aci -> sonrasi_foto_ok -> musteri_onay (24s pencere baslar)
"""
from __future__ import annotations

import hashlib
import json
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import settings
from app.core.db import get_db
from app.core.security import CurrentUser, Role, require_roles
from app.core.supabase import (
    EVIDENCE_BUCKET,
    create_signed_upload_url,
    create_signed_url,
    download_bytes,
)
from app.schemas import (
    EvidenceConfirmRequest,
    EvidenceConfirmResponse,
    EvidenceUploadRequest,
    EvidenceUploadResponse,
    EvidenceViewResponse,
    FotoAci,
    FotoEvre,
)

router = APIRouter(prefix="/evidence", tags=["evidence"])

# 6 zorunlu aci (her evre icin) — tamamlanma kontrolu.
_TUM_ACILAR: frozenset[str] = frozenset(a.value for a in FotoAci)

# Evre -> bu evrede foto cekilebilen siparis durumu.
_EVRE_DURUM = {FotoEvre.ONCESI.value: "varildi", FotoEvre.SONRASI.value: "yikama"}


def _storage_path(order_id: UUID, evre: str, aci: str) -> str:
    return f"{order_id}/{evre}/{aci}.webp"


async def _assigned_order(
    db: asyncpg.Connection, order_id: UUID, user: CurrentUser
) -> asyncpg.Record:
    """Siparis bu hizmet verene atanmis mi + plaza konumunu getir."""
    row = await db.fetchrow(
        """
        SELECT o.id, o.status, o.hizmet_veren_id, o.plaza_id, p.konum AS plaza_konum
        FROM app.orders o
        LEFT JOIN app.plazalar p ON p.id = o.plaza_id
        WHERE o.id = $1
        """,
        order_id,
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "siparis_bulunamadi", "detay": "Siparis yok"},
        )
    if str(row["hizmet_veren_id"] or "") != user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "yetkisiz", "detay": "Siparis size atanmamis"},
        )
    return row


async def _gps_plaza_icinde(
    db: asyncpg.Connection, lon: float, lat: float, order_id: UUID
) -> bool:
    """Cekim konumu plaza geofence (radius) icinde mi (§3 GPS damgasi)."""
    return bool(
        await db.fetchval(
            """
            SELECT ST_DWithin(
                     p.konum,
                     ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                     $3)
            FROM app.orders o JOIN app.plazalar p ON p.id = o.plaza_id
            WHERE o.id = $4
            """,
            lon, lat, settings.geofence_radius_m, order_id,
        )
    )


@router.post("/upload-url", response_model=EvidenceUploadResponse)
async def get_upload_url(
    body: EvidenceUploadRequest,
    user: CurrentUser = Depends(require_roles(Role.HIZMET_VEREN)),
    db: asyncpg.Connection = Depends(get_db),
) -> EvidenceUploadResponse:
    """Imzali yukleme URL'i (§3.4): yetki + durum + GPS geofence -> signed upload URL."""
    order = await _assigned_order(db, body.order_id, user)

    beklenen = _EVRE_DURUM[body.evre]
    if order["status"] != beklenen:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "gecersiz_durum",
                    "detay": f"'{body.evre}' foto icin durum '{beklenen}' olmali; mevcut '{order['status']}'"},
        )
    if order["plaza_konum"] is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "plaza_konum_yok", "detay": "Siparis plazasinin konumu tanimsiz"},
        )
    if not await _gps_plaza_icinde(db, body.gps.lon, body.gps.lat, body.order_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "gps_disinda", "detay": "Konum plaza geofence disinda"},
        )

    path = _storage_path(body.order_id, body.evre, body.aci)
    try:
        res = create_signed_upload_url(EVIDENCE_BUCKET, path)
    except Exception as exc:  # noqa: BLE001 — Storage hatasi 502
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"error": "storage_hatasi", "detay": "Imzali yukleme URL'i alinamadi"},
        ) from exc

    # supabase-py surumune gore anahtar adi degisebilir.
    upload_url = res.get("signed_url") or res.get("signedURL") or res.get("signedUrl") or ""
    return EvidenceUploadResponse(
        upload_url=upload_url,
        storage_path=path,
        expires_in=7200,  # Supabase upload token TTL (~2 saat)
    )


@router.post("/confirm", response_model=EvidenceConfirmResponse)
async def confirm_evidence(
    body: EvidenceConfirmRequest,
    user: CurrentUser = Depends(require_roles(Role.HIZMET_VEREN)),
    db: asyncpg.Connection = Depends(get_db),
) -> EvidenceConfirmResponse:
    """Sunucu re-hash dogrulamasi + INSERT (§3.2 adim 7-9).

    1. Storage'tan indir -> YENIDEN SHA-256; istemci hash'i ile karsilastir (409).
    2. photo_evidence INSERT (append-only) + audit.
    3. 6 aci tamamlandiysa durum gecisi (oncesi_foto_ok / sonrasi_foto_ok[-> musteri_onay]).
    """
    order = await _assigned_order(db, body.order_id, user)
    beklenen = _EVRE_DURUM[body.evre]
    if order["status"] != beklenen:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "gecersiz_durum",
                    "detay": f"'{body.evre}' foto icin durum '{beklenen}' olmali; mevcut '{order['status']}'"},
        )

    path = _storage_path(body.order_id, body.evre, body.aci)

    # 1) Sunucu re-hash (kurcalama reddi)
    try:
        data = await download_bytes(EVIDENCE_BUCKET, path)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "dosya_yok", "detay": "Yuklenen dosya bulunamadi (once upload edin)"},
        ) from exc
    gercek = hashlib.sha256(data).hexdigest()
    if gercek.lower() != body.sha256.lower():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "hash_uyusmazligi", "detay": "Sunucu hash'i istemci ile eslesmedi"},
        )

    # 2) INSERT (append-only; tekrar confirm idempotent)
    # NOT: photo_evidence'ta UPDATE/DELETE RULE'lari var -> ON CONFLICT kullanilamaz
    # (Postgres kisiti). Idempotency: savepoint icinde INSERT, unique cakismayi yut.
    async with db.transaction():
        inserted = None
        try:
            async with db.transaction():  # iç savepoint
                inserted = await db.fetchval(
                    """
                    INSERT INTO app.photo_evidence
                      (order_id, hizmet_veren_id, evre, aci, storage_path, sha256, gps, cekim_ts)
                    VALUES ($1, $2, $3::app.foto_evre, $4::app.foto_aci, $5, $6,
                            ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography, $9)
                    RETURNING id
                    """,
                    body.order_id, user.user_id, body.evre, body.aci,
                    path, body.sha256.lower(), body.gps.lon, body.gps.lat, body.cihaz_ts,
                )
        except asyncpg.UniqueViolationError:
            inserted = None  # bu aci zaten onaylanmis (idempotent tekrar)
        if inserted is not None:
            await db.execute(
                """
                INSERT INTO audit.events (event_type, order_id, actor_id, payload)
                VALUES ($1, $2, $3, $4::jsonb)
                """,
                "before_photo_submitted" if body.evre == FotoEvre.ONCESI
                else "after_photo_submitted",
                body.order_id, user.user_id,
                json.dumps({"evre": body.evre, "aci": body.aci}),
            )

        # 3) Tamamlanma kontrolu
        done = {
            r["aci"]
            for r in await db.fetch(
                "SELECT aci FROM app.photo_evidence WHERE order_id = $1 AND evre = $2::app.foto_evre",
                body.order_id, body.evre,
            )
        }
        remaining = sorted(_TUM_ACILAR - done)
        yeni_status: str | None = None
        if not remaining:
            yeni_status = await _evre_tamamlandi(db, body.order_id, body.evre, user)

    return EvidenceConfirmResponse(
        accepted=True,
        evre=body.evre,
        aci=body.aci,
        remaining=[FotoAci(a) for a in remaining],
        status=yeni_status,
    )


async def _evre_tamamlandi(
    db: asyncpg.Connection, order_id: UUID, evre: FotoEvre, user: CurrentUser
) -> str | None:
    """6 aci tamamlaninca durum gecisi. Sonrasi tamamlaninca musteri_onay'a gec (24s)."""
    if evre == FotoEvre.ONCESI:
        row = await db.fetchrow(
            "UPDATE app.orders SET status='oncesi_foto_ok' "
            "WHERE id=$1 AND status='varildi' AND hizmet_veren_id=$2 RETURNING status",
            order_id, user.user_id,
        )
        return row["status"] if row else None

    # SONRASI: yikama -> sonrasi_foto_ok -> musteri_onay (onay penceresi baslar)
    row = await db.fetchrow(
        "UPDATE app.orders SET status='sonrasi_foto_ok' "
        "WHERE id=$1 AND status='yikama' AND hizmet_veren_id=$2 RETURNING status",
        order_id, user.user_id,
    )
    if row is None:
        return None
    row2 = await db.fetchrow(
        "UPDATE app.orders SET status='musteri_onay' "
        "WHERE id=$1 AND status='sonrasi_foto_ok' RETURNING status",
        order_id,
    )
    return row2["status"] if row2 else "sonrasi_foto_ok"


@router.get("/{order_id}/{evre}/{aci}/view", response_model=EvidenceViewResponse)
async def view_evidence(
    order_id: UUID,
    evre: FotoEvre,
    aci: FotoAci,
    user: CurrentUser = Depends(
        require_roles(Role.MUSTERI, Role.HIZMET_VEREN, Role.DISPATCHER, Role.ADMIN)
    ),
    db: asyncpg.Connection = Depends(get_db),
) -> EvidenceViewResponse:
    """60 sn imzali goruntuleme URL'i (§7.4). Kalici public URL ASLA verilmez."""
    row = await db.fetchrow(
        "SELECT musteri_id, hizmet_veren_id FROM app.orders WHERE id = $1", order_id
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "siparis_bulunamadi", "detay": "Siparis yok"},
        )
    if user.role not in (Role.DISPATCHER, Role.ADMIN) and user.user_id not in (
        str(row["musteri_id"]), str(row["hizmet_veren_id"] or ""),
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "yetkisiz", "detay": "Bu siparisin tarafi degilsiniz"},
        )

    path = _storage_path(order_id, evre.value, aci.value)
    try:
        signed = create_signed_url(EVIDENCE_BUCKET, path, settings.evidence_signed_url_ttl)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "foto_yok", "detay": "Kanit bulunamadi"},
        ) from exc
    return EvidenceViewResponse(signed_url=signed, expires_in=settings.evidence_signed_url_ttl)
