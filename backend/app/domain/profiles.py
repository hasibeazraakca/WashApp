"""Profil yardimcilari — auth.users <-> app.profiles tembel sağlama.

Supabase Auth kullaniciyi auth.users'a yazar; is verisi app.profiles'tadir (1:1).
Migration'da otomatik trigger YOK (basit tutuldu) — bu yuzden ilk korumalı istekte
profil satiri tembel (lazy) olusturulur. Kaynak: JWT claim'leri (app_metadata.role,
user_metadata.full_name, email). Yazma service_role ile (RLS bypass).
"""
from __future__ import annotations

import asyncpg

from app.core.security import CurrentUser


def _ad_soyad(user: CurrentUser) -> str:
    """JWT'den gorunen ad cikar (NOT NULL kolon icin makul varsayilan)."""
    meta = user.claims.get("user_metadata") or {}
    for key in ("full_name", "name", "ad_soyad"):
        val = meta.get(key)
        if val:
            return str(val)
    if user.email:
        return user.email.split("@", 1)[0]
    return "Kullanici"


async def ensure_profile(conn: asyncpg.Connection, user: CurrentUser) -> asyncpg.Record:
    """app.profiles satirini garantile (yoksa olustur) ve dondur.

    role/email JWT'den tazelenir (app_metadata.role tek otorite — §7.1).
    telefon/kvkk_onay kullanici akisinda doldurulur, burada dokunulmaz.
    """
    return await conn.fetchrow(
        """
        INSERT INTO app.profiles (id, role, ad_soyad, email)
        VALUES ($1, $2::app.user_role, $3, $4)
        ON CONFLICT (id) DO UPDATE
            SET role = EXCLUDED.role,
                email = COALESCE(app.profiles.email, EXCLUDED.email),
                updated_at = now()
        RETURNING id, role, ad_soyad, telefon, email, kvkk_onay_ts, created_at
        """,
        user.user_id,
        user.role.value,
        _ad_soyad(user),
        user.email,
    )
