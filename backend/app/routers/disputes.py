"""Itiraz endpoint'leri — itiraz cozumu + ledger (tazminat/rucu) (PR-10).

Itiraz acma orders/{id}/dispute'da (capture durur). Burada dispatcher/admin
karar verir; platform_karsilar -> koruma fonundan tazminat, kusurlu HV'den rucu.
"""
from __future__ import annotations

from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends

from app.core.db import get_db
from app.core.security import CurrentUser, Role, require_roles
from app.schemas import Dispute, DisputeResolveRequest

router = APIRouter(prefix="/disputes", tags=["disputes"])


@router.get("/{dispute_id}", response_model=Dispute)
async def get_dispute(
    dispute_id: UUID,
    user: CurrentUser = Depends(require_roles(Role.DISPATCHER, Role.ADMIN)),
    db: asyncpg.Connection = Depends(get_db),
) -> Dispute:
    """Itiraz detayi (oncesi/sonrasi panel staff erisimi)."""
    # TODO(Faz-3): SELECT dispute + iliskili foto kanit referanslari.
    raise NotImplementedError("get_dispute")


@router.post("/{dispute_id}/resolve", response_model=Dispute)
async def resolve_dispute(
    dispute_id: UUID,
    body: DisputeResolveRequest,
    user: CurrentUser = Depends(require_roles(Role.DISPATCHER, Role.ADMIN)),
    db: asyncpg.Connection = Depends(get_db),
) -> Dispute:
    """Itiraz karari + ledger (§4.2 adim 4).

    sonuc'a gore:
      - musteri_reddedildi -> normal capture (siparis tamamlandi).
      - hizmet_veren_kusurlu/platform_karsilar -> iade + koruma_fonu_odeme,
        gerekirse rucu (HV cuzdandan geri al).
    Tek transaction; audit.admin_actions(dispute_karar) loglanir.
    """
    # TODO(Faz-3): karar + ledger satirlari + status gecisi + audit log.
    raise NotImplementedError("resolve_dispute")
