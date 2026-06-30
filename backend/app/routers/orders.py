"""Siparis endpoint'leri — olusturma + durum makinesi gecisleri (§6.1).

Durum gecisleri DB trigger ile DE zorlanir (02-veri-mimarisi.md §3.4) — backend
bu yansimayi destekler ama son savunma DB'dedir.
"""
from __future__ import annotations

from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, status

from app.core.db import get_db
from app.core.security import CurrentUser, Role, require_roles
from app.schemas import (
    ConfirmResponse,
    DisputeOpenRequest,
    Order,
    OrderCreate,
    OrderCreateResponse,
    StatusTransitionResponse,
)

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("", response_model=OrderCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_order(
    body: OrderCreate,
    user: CurrentUser = Depends(require_roles(Role.MUSTERI)),
    db: asyncpg.Connection = Depends(get_db),
) -> OrderCreateResponse:
    """Siparis olustur: geofence + fiyat snapshot + escrow provizyon (§6.2).

    Akis:
      1. ST_Within ile pilot bolge kontrolu (geofence_disinda -> 403).
      2. pricing.compute() ile fiyat snapshot (komisyon 0.22, koruma fonu 15).
      3. orders INSERT (status=olusturuldu, fiyat donduruldu).
      4. Iyzico provizyon (auth) -> escrow_holds(durum=bloke) + ledger escrow_hold.
      5. audit.event order_created.
    """
    # TODO(Faz-1): geofence kontrolu + fiyat snapshot + INSERT.
    # TODO(Faz-2): Iyzico provizyon cagrisi (escrow.start_hold).
    raise NotImplementedError("create_order — F1/F2'de implemente edilecek")


@router.get("/{order_id}", response_model=Order)
async def get_order(
    order_id: UUID,
    user: CurrentUser = Depends(require_roles(Role.MUSTERI, Role.HIZMET_VEREN, Role.DISPATCHER, Role.ADMIN)),
    db: asyncpg.Connection = Depends(get_db),
) -> Order:
    """Siparis detay (taraf kontrolu; agir listeleme Supabase RLS'ten — §2.4)."""
    # TODO(Faz-1): SELECT + taraf yetki kontrolu (musteri_id/hizmet_veren_id/staff).
    raise NotImplementedError("get_order")


@router.post("/{order_id}/arrive", response_model=StatusTransitionResponse)
async def arrive(
    order_id: UUID,
    user: CurrentUser = Depends(require_roles(Role.HIZMET_VEREN)),
    db: asyncpg.Connection = Depends(get_db),
) -> StatusTransitionResponse:
    """'Vardim' — plaza geofence dogrula -> status: varildi (PR-14)."""
    # TODO(Faz-1): GPS geofence + status UPDATE (trigger gecisi dogrular).
    raise NotImplementedError("arrive")


@router.post("/{order_id}/start-wash", response_model=StatusTransitionResponse)
async def start_wash(
    order_id: UUID,
    user: CurrentUser = Depends(require_roles(Role.HIZMET_VEREN)),
    db: asyncpg.Connection = Depends(get_db),
) -> StatusTransitionResponse:
    """oncesi_foto_ok -> yikama (6 oncesi foto tamamlandiktan sonra)."""
    # TODO(Faz-1): oncesi foto tamam mi kontrol + status UPDATE.
    raise NotImplementedError("start_wash")


@router.post("/{order_id}/confirm", response_model=ConfirmResponse)
async def confirm_order(
    order_id: UUID,
    user: CurrentUser = Depends(require_roles(Role.MUSTERI)),
    db: asyncpg.Connection = Depends(get_db),
) -> ConfirmResponse:
    """Musteri onayi -> Iyzico CAPTURE -> tamamlandi (§6.3).

    Ledger cift giris: komisyon + koruma_fonu_katki + payout (tek transaction).
    """
    # TODO(Faz-2): escrow.capture + ledger satirlari + status=tamamlandi.
    raise NotImplementedError("confirm_order")


@router.post("/{order_id}/dispute", response_model=StatusTransitionResponse)
async def open_dispute(
    order_id: UUID,
    body: DisputeOpenRequest,
    user: CurrentUser = Depends(require_roles(Role.MUSTERI)),
    db: asyncpg.Connection = Depends(get_db),
) -> StatusTransitionResponse:
    """Itiraz ac -> capture DURUR, status=itiraz (§4.1). disputes router'i cozer."""
    # TODO(Faz-3): disputes INSERT + status=itiraz + capture beklet.
    raise NotImplementedError("open_dispute")
