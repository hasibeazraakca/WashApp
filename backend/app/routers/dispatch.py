"""Dispatch endpoint'leri — yari-manuel eslestirme (PR-11, §5.3).

KNN aday sıralama (PostGIS <-> + ST_DWithin); demirli plaza once. Dispatcher
1. siradaki algoritmik oneriyi kabul eder VEYA override eder (auto/manual).
"""
from __future__ import annotations

from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends

from app.core.db import get_db
from app.core.security import CurrentUser, Role, require_roles
from app.schemas import (
    DispatchAssignRequest,
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
    """En yakin 5 musait + aktif + puan>=4.2 aday (§6.2 KNN sorgusu).

    SELECT ... FROM hizmet_veren_konum JOIN hizmet_veren_detay
      WHERE musait AND aktif AND ST_DWithin(konum, musteri_konum, 3000)
      ORDER BY ayni_plaza DESC, ortalama_puan DESC, konum <-> musteri_konum
      LIMIT 5;
    """
    # TODO(Faz-1): PostGIS KNN sorgusu + 1. sira oneri.
    raise NotImplementedError("list_candidates")


@router.post("/{order_id}/assign", response_model=StatusTransitionResponse)
async def assign(
    order_id: UUID,
    body: DispatchAssignRequest,
    user: CurrentUser = Depends(require_roles(Role.DISPATCHER, Role.ADMIN)),
    db: asyncpg.Connection = Depends(get_db),
) -> StatusTransitionResponse:
    """Aday ata/override -> orders.hizmet_veren_id + dispatch_mode, status=eslestirildi.

    Realtime -> hizmet veren app'inde 'yeni is'. audit.event order_matched{mode}.
    """
    # TODO(Faz-1): UPDATE hizmet_veren_id+dispatch_mode + status gecisi + audit.
    raise NotImplementedError("assign")
