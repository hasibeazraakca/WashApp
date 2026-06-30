"""Odeme endpoint'leri — escrow provizyon baslat / iade (§4.1).

Para = cift girisli defter (money.ledger_entries append-only). Tum para islemi
YALNIZCA FastAPI -> Postgres service_role (mobil asla — §2.4 altin kural).
"""
from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends

from app.core.db import get_db
from app.core.security import CurrentUser, Role, require_roles
from app.schemas import (
    PaymentIntent,
    PaymentIntentResponse,
    RefundRequest,
    WalletSummary,
)

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("/intent", response_model=PaymentIntentResponse)
async def create_intent(
    body: PaymentIntent,
    user: CurrentUser = Depends(require_roles(Role.MUSTERI)),
    db: asyncpg.Connection = Depends(get_db),
) -> PaymentIntentResponse:
    """Escrow provizyon (auth) baslat — gun-0 kart bloke, para CEKILMEZ (§4.1).

    Ledger: escrow_hold(+escrow) / escrow_hold(-psp_clearing).
    escrow_holds(durum=bloke). Webhook auth_success ile dogrulanir.
    """
    # TODO(Faz-2): Iyzico provizyon SDK cagrisi + escrow_holds INSERT + ledger.
    raise NotImplementedError("create_intent")


@router.post("/refund")
async def refund(
    body: RefundRequest,
    user: CurrentUser = Depends(require_roles(Role.DISPATCHER, Role.ADMIN)),
    db: asyncpg.Connection = Depends(get_db),
) -> dict:
    """Iade — iptal/itiraz iadesi (provizyon iptal veya capture sonrasi refund)."""
    # TODO(Faz-2): Iyzico refund + ledger 'iade' + escrow_holds(durum=iade).
    raise NotImplementedError("refund")


@router.get("/wallet", response_model=WalletSummary)
async def get_wallet(
    user: CurrentUser = Depends(require_roles(Role.HIZMET_VEREN)),
    db: asyncpg.Connection = Depends(get_db),
) -> WalletSummary:
    """Cuzdan bakiyesi — money'den OZET (mobil money.* okuyamaz, §4.3)."""
    # TODO(Faz-2): money.wallets bakiye (ledger SUM ile mutabik) SELECT.
    raise NotImplementedError("get_wallet")
