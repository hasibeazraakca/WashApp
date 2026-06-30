"""Abonelik endpoint'leri — başlatma + hak düşümü (PR-12).

Plan sabitleri: 2_yikama 790 TL/ay, 4_yikama 1490 TL/ay (config'ten).
"""
from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import settings
from app.core.db import get_db
from app.core.security import CurrentUser, Role, require_roles
from app.schemas import Subscription, SubscriptionCreate

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])

# Plan -> (aylik ucret, hak adedi) eslesmesi (plan sabitleri).
_PLAN_MAP = {
    "2_yikama": (settings.subscription_2_wash_tl, 2),
    "4_yikama": (settings.subscription_4_wash_tl, 4),
}


@router.post("", response_model=Subscription, status_code=status.HTTP_201_CREATED)
async def create_subscription(
    body: SubscriptionCreate,
    user: CurrentUser = Depends(require_roles(Role.MUSTERI)),
    db: asyncpg.Connection = Depends(get_db),
) -> Subscription:
    """Abonelik baslat (recurring) — Iyzico recurring + subscriptions INSERT."""
    if body.plan not in _PLAN_MAP:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "gecersiz_plan", "detay": "2_yikama veya 4_yikama"},
        )
    # TODO(Faz-4): Iyzico recurring kurulum + subscriptions INSERT (kalan_hak=adet).
    raise NotImplementedError("create_subscription")


@router.get("", response_model=Subscription | None)
async def get_active_subscription(
    user: CurrentUser = Depends(require_roles(Role.MUSTERI)),
    db: asyncpg.Connection = Depends(get_db),
) -> Subscription | None:
    """Musterinin aktif aboneligi (kalan hak gosterimi)."""
    # TODO(Faz-4): SELECT durum='aktif' subscription.
    raise NotImplementedError("get_active_subscription")
