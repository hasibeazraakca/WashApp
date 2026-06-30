"""Kimlik endpoint'leri — GET/PATCH /me (profil tembel saglama).

Supabase Auth JWT tek kimlik kaynagi; app.profiles is verisi 1:1. Ilk korumalı
istekte profil tembel olusturulur (domain.profiles.ensure_profile).
"""
from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends

from app.core.db import get_db
from app.core.security import CurrentUserDep
from app.domain.profiles import ensure_profile
from app.schemas import MeResponse, ProfileUpdateRequest

router = APIRouter(prefix="/me", tags=["me"])


@router.get("", response_model=MeResponse)
async def get_me(
    user: CurrentUserDep,
    db: asyncpg.Connection = Depends(get_db),
) -> MeResponse:
    """Mevcut kullanicinin profili (yoksa JWT'den olusturulur)."""
    row = await ensure_profile(db, user)
    return MeResponse(**dict(row))


@router.patch("", response_model=MeResponse)
async def update_me(
    body: ProfileUpdateRequest,
    user: CurrentUserDep,
    db: asyncpg.Connection = Depends(get_db),
) -> MeResponse:
    """Kullanici kendi profilini gunceller (ad/telefon/KVKK onay).

    kvkk_onay=true -> kvkk_onay_ts = now() (onaysiz siparis akisi yok — §hukuk).
    """
    await ensure_profile(db, user)  # satir mevcut oldugundan emin ol
    row = await db.fetchrow(
        """
        UPDATE app.profiles
        SET ad_soyad     = COALESCE($2, ad_soyad),
            telefon      = COALESCE($3, telefon),
            kvkk_onay_ts = CASE WHEN $4::bool IS TRUE AND kvkk_onay_ts IS NULL
                                THEN now() ELSE kvkk_onay_ts END,
            updated_at   = now()
        WHERE id = $1
        RETURNING id, role, ad_soyad, telefon, email, kvkk_onay_ts, created_at
        """,
        user.user_id,
        body.ad_soyad,
        body.telefon,
        body.kvkk_onay,
    )
    return MeResponse(**dict(row))
