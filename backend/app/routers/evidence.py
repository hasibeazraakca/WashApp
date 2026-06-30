"""Fotoğraf kanit endpoint'leri — in-app kamera anti-fraud omurgasi (PR-2/3/4).

03-yazilim-mimarisi.md §3: galeri yuklemesi imkansiz, istemci+sunucu SHA-256,
GPS damgasi, append-only. Sunucu re-hash eslesmezse 409 (kurcalama reddi).
"""
from __future__ import annotations

from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends

from app.core.db import get_db
from app.core.security import CurrentUser, Role, require_roles
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


@router.post("/upload-url", response_model=EvidenceUploadResponse)
async def get_upload_url(
    body: EvidenceUploadRequest,
    user: CurrentUser = Depends(require_roles(Role.HIZMET_VEREN)),
    db: asyncpg.Connection = Depends(get_db),
) -> EvidenceUploadResponse:
    """Imzali yukleme URL'i (§3.4).

    Akis:
      1. Siparis bu hizmet verene atanmis mi? (yetki)
      2. GPS plaza geofence icinde mi? Degilse 403 gps_disinda.
      3. Storage path: evidence/{order_id}/{evre}/{aci}.webp
      4. create_signed_upload_url -> 60 sn TTL.
    """
    # TODO(Faz-1): yetki + geofence + storage signed upload URL.
    raise NotImplementedError("get_upload_url")


@router.post("/confirm", response_model=EvidenceConfirmResponse)
async def confirm_evidence(
    body: EvidenceConfirmRequest,
    user: CurrentUser = Depends(require_roles(Role.HIZMET_VEREN)),
    db: asyncpg.Connection = Depends(get_db),
) -> EvidenceConfirmResponse:
    """Sunucu re-hash dogrulamasi + INSERT (§3.2 adim 7-9).

    Akis:
      1. Storage'tan dosyayi indir -> YENIDEN SHA-256 hesapla.
      2. Istemci sha256 ile karsilastir; eslesmezse 409 (satir INSERT EDILMEZ).
      3. photo_evidence INSERT (service_role) + audit before/after_photos_submitted.
      4. 6 aci tamamlandiysa durum gecisi (oncesi_foto_ok / sonrasi_foto_ok).
    """
    # TODO(Faz-1): download_bytes + re-hash + 409 karsilastirma + INSERT.
    _ = (FotoEvre, FotoAci)  # enum referansi (codegen icin)
    raise NotImplementedError("confirm_evidence")


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
    # TODO(Faz-1): taraf/staff yetki + createSignedUrl(60s).
    raise NotImplementedError("view_evidence")
