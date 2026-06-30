"""Hizmet veren endpoint'leri — onboarding/KYC adimlari + durum (PR-9).

KYC belge yukleme evidence-kyc private bucket; her goruntuleme audit.admin_actions'a
loglanir (§7.3). Rol/aktiflik onaylanmadan verilmez (set_user_role backend'den).
"""
from __future__ import annotations

from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends

from app.core.db import get_db
from app.core.security import CurrentUser, Role, require_roles
from app.schemas import OnboardingStepRequest, ProviderStatus

router = APIRouter(prefix="/providers", tags=["providers"])


@router.post("/onboarding/{step}", response_model=ProviderStatus)
async def submit_onboarding_step(
    step: str,
    body: OnboardingStepRequest,
    user: CurrentUser = Depends(require_roles(Role.HIZMET_VEREN)),
    db: asyncpg.Connection = Depends(get_db),
) -> ProviderStatus:
    """Onboarding adimi gonder (belge/egitim).

    step: 'adli_sicil' | 'kimlik' | 'ikametgah' | 'ekipman_video' | 'egitim'.
    Belge -> onboarding_belgeleri INSERT (storage_path + sha256). Onay manuel
    (MVP'de admin; §10 risk: KYC otomasyon sonra).
    """
    # TODO(Faz-3): onboarding_belgeleri INSERT + hizmet_veren_detay durum guncelle.
    raise NotImplementedError("submit_onboarding_step")


@router.get("/me/status", response_model=ProviderStatus)
async def get_my_status(
    user: CurrentUser = Depends(require_roles(Role.HIZMET_VEREN)),
    db: asyncpg.Connection = Depends(get_db),
) -> ProviderStatus:
    """Hizmet verenin onboarding durumu + eksik adimlar + aktiflik."""
    # TODO(Faz-3): hizmet_veren_detay SELECT + eksik adim hesapla.
    raise NotImplementedError("get_my_status")


@router.post("/{profile_id}/approve", response_model=ProviderStatus)
async def approve_provider(
    profile_id: UUID,
    user: CurrentUser = Depends(require_roles(Role.ADMIN, Role.DISPATCHER)),
    db: asyncpg.Connection = Depends(get_db),
) -> ProviderStatus:
    """KYC onayi (admin) -> durum=onayli, rol claim yaz, audit.admin_actions log."""
    # TODO(Faz-3): durum=onayli + set_user_role(hizmet_veren) + audit log.
    raise NotImplementedError("approve_provider")
