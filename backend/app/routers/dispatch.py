"""Dispatch endpoint'leri — yari-manuel eslestirme (PR-11, §5.3).

KNN aday sıralama (PostGIS <-> + ST_DWithin); demirli plaza once. Dispatcher
1. siradaki algoritmik oneriyi kabul eder VEYA override eder (auto/manual).
"""
from __future__ import annotations

import json
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import settings
from app.core.db import get_db
from app.core.security import CurrentUser, Role, require_roles
from app.schemas import (
    DispatchAssignRequest,
    DispatchCandidate,
    DispatchCandidatesResponse,
    StatusTransitionResponse,
)

router = APIRouter(prefix="/dispatch", tags=["dispatch"])


@router.get("/{order_id}/candidates", response_model=DispatchCandidatesResponse)
async def list_candidates(
    order_id: UUID,
    user: CurrentUser = Depends(require_roles(Role.DISPATCHER, Role.ADMIN)),
    db: asyncpg.Connection = Depends(get_db),
) -> DispatchCandidatesResponse:
    """En yakin 5 musait + aktif + puan>=4.2 aday (02-veri §6.2 KNN sorgusu).

    Siralama: ayni_plaza (demirleme) -> ortalama_puan -> mesafe (KNN <-> indeks).
    """
    siparis = await db.fetchrow(
        "SELECT konum, plaza_id, status FROM app.orders WHERE id = $1", order_id
    )
    if siparis is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "siparis_bulunamadi", "detay": "Siparis yok"},
        )
    if siparis["konum"] is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "konum_yok", "detay": "Siparis konumu tanimsiz"},
        )

    rows = await db.fetch(
        """
        SELECT hk.hizmet_veren_id,
               hd.ortalama_puan,
               ST_Distance(hk.konum, o.konum) AS mesafe_m,
               (hk.demir_plaza_id IS NOT DISTINCT FROM o.plaza_id) AS ayni_plaza
        FROM app.hizmet_veren_konum hk
        JOIN app.hizmet_veren_detay hd ON hd.profile_id = hk.hizmet_veren_id
        CROSS JOIN (SELECT konum, plaza_id FROM app.orders WHERE id = $1) o
        WHERE hk.musait = true
          AND hd.aktif = true
          AND ST_DWithin(hk.konum, o.konum, $2)
        ORDER BY ayni_plaza DESC,
                 hd.ortalama_puan DESC NULLS LAST,
                 hk.konum <-> o.konum
        LIMIT 5
        """,
        order_id, settings.geofence_radius_m,
    )
    candidates = [
        DispatchCandidate(
            hizmet_veren_id=r["hizmet_veren_id"],
            ortalama_puan=r["ortalama_puan"],
            mesafe_m=r["mesafe_m"],
            ayni_plaza=r["ayni_plaza"],
        )
        for r in rows
    ]
    return DispatchCandidatesResponse(
        order_id=order_id,
        candidates=candidates,
        onerilen=candidates[0].hizmet_veren_id if candidates else None,
    )


@router.post("/{order_id}/assign", response_model=StatusTransitionResponse)
async def assign(
    order_id: UUID,
    body: DispatchAssignRequest,
    user: CurrentUser = Depends(require_roles(Role.DISPATCHER, Role.ADMIN)),
    db: asyncpg.Connection = Depends(get_db),
) -> StatusTransitionResponse:
    """Aday ata/override -> hizmet_veren_id + dispatch_mode, status=eslestirildi.

    Yalniz 'olusturuldu' siparise atama yapilir (trigger gecisi de zorlar).
    audit.event order_matched{mode}. Realtime ile HV app'inde 'yeni is' (F2 push).
    """
    # Aday aktif HV mi? (gercek ret hakki: atama oneri; HV reddederse dispatcher tekrar atar)
    aktif = await db.fetchval(
        "SELECT aktif FROM app.hizmet_veren_detay WHERE profile_id = $1",
        body.hizmet_veren_id,
    )
    if aktif is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "hv_bulunamadi", "detay": "Hizmet veren yok"},
        )
    if not aktif:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "hv_aktif_degil", "detay": "Hizmet veren aktif degil (puan/onay)"},
        )

    async with db.transaction():
        row = await db.fetchrow(
            """
            UPDATE app.orders
            SET hizmet_veren_id = $2,
                dispatch_mode   = $3,
                status          = 'eslestirildi'
            WHERE id = $1 AND status = 'olusturuldu'
            RETURNING id, status
            """,
            order_id, body.hizmet_veren_id, body.mode,
        )
        if row is None:
            cur = await db.fetchval("SELECT status FROM app.orders WHERE id = $1", order_id)
            if cur is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail={"error": "siparis_bulunamadi", "detay": "Siparis yok"},
                )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"error": "gecersiz_durum",
                        "detay": f"Atama yalniz 'olusturuldu' durumunda; mevcut '{cur}'"},
            )
        await db.execute(
            """
            INSERT INTO audit.events (event_type, order_id, actor_id, payload)
            VALUES ('order_matched', $1, $2, $3::jsonb)
            """,
            order_id, user.user_id,
            json.dumps({"hizmet_veren_id": str(body.hizmet_veren_id),
                        "mode": body.mode}),
        )
    return StatusTransitionResponse(order_id=row["id"], status=row["status"])
