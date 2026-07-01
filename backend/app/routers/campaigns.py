"""Kampanya endpoint'leri — listeleme + tiklama takibi + admin olusturma.

Altin kural: LISTELEME agir okuma Supabase RLS'ten de yapilabilir (mobil dogrudan
okur). Ama TIKLAMA yazma + sayac guncelleme her zaman FastAPI (service_role):
app.kampanya_tiklama tablosu RLS-kilitli, yalniz backend yazar.

F1 kapsam: parasiz. Kampanya = reklam/sponsor banner'i (gorsel + yazi + hangi arac
yikamaya ait + tiklanma sayaci).
"""
from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.db import get_db
from app.core.security import CurrentUser, CurrentUserDep, Role, require_roles
from app.domain.profiles import ensure_profile
from app.schemas import Campaign, CampaignClickResponse, CampaignCreate

router = APIRouter(prefix="/campaigns", tags=["campaigns"])

_CAMPAIGN_COLS = """
    id, baslik, aciklama, gorsel_url, hizmet_veren_id, sponsor_ad, hedef_url,
    aktif, siralama, tiklama_sayisi, created_at
"""


@router.get("", response_model=list[Campaign])
async def list_campaigns(
    user: CurrentUserDep,
    db: asyncpg.Connection = Depends(get_db),
) -> list[Campaign]:
    """Aktif kampanyalar (tarih penceresi icinde), siralamaya gore.

    Mobil bu listeyi Supabase RLS'ten de okuyabilir; bu endpoint backend
    tuketiciler + admin panel + test icin ayni veriyi dondurur.
    """
    rows = await db.fetch(
        f"""
        SELECT {_CAMPAIGN_COLS}
        FROM app.kampanyalar
        WHERE aktif = true
          AND (baslangic IS NULL OR baslangic <= current_date)
          AND (bitis     IS NULL OR bitis     >= current_date)
        ORDER BY siralama DESC, created_at DESC
        LIMIT 50
        """
    )
    return [Campaign(**dict(r)) for r in rows]


@router.post("/{kampanya_id}/click", response_model=CampaignClickResponse)
async def track_click(
    kampanya_id: str,
    user: CurrentUserDep,
    db: asyncpg.Connection = Depends(get_db),
) -> CampaignClickResponse:
    """Kampanya tiklamasini kaydet + sayaci artir (tek transaction).

    Yazma otoritesi backend (service_role): mobil app.kampanya_tiklama'ya
    dogrudan yazamaz. kullanici_id icin profil garanti edilir (FK).
    """
    await ensure_profile(db, user)  # kullanici_id FK'si icin profil garanti
    async with db.transaction():
        row = await db.fetchrow(
            """
            UPDATE app.kampanyalar
            SET tiklama_sayisi = tiklama_sayisi + 1,
                updated_at     = now()
            WHERE id = $1
            RETURNING id, tiklama_sayisi
            """,
            kampanya_id,
        )
        if row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "kampanya_bulunamadi", "detay": "Kampanya yok"},
            )
        await db.execute(
            """
            INSERT INTO app.kampanya_tiklama (kampanya_id, kullanici_id)
            VALUES ($1, $2)
            """,
            kampanya_id, user.user_id,
        )
    return CampaignClickResponse(
        kampanya_id=row["id"], tiklama_sayisi=row["tiklama_sayisi"]
    )


@router.post("", response_model=Campaign, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    body: CampaignCreate,
    user: CurrentUser = Depends(require_roles(Role.ADMIN)),
    db: asyncpg.Connection = Depends(get_db),
) -> Campaign:
    """Yeni kampanya olustur (yalniz admin). Gorsel + yazi + hangi arac yikama."""
    row = await db.fetchrow(
        f"""
        INSERT INTO app.kampanyalar
          (baslik, aciklama, gorsel_url, hizmet_veren_id, sponsor_ad,
           hedef_url, siralama, baslangic, bitis)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::date)
        RETURNING {_CAMPAIGN_COLS}
        """,
        body.baslik, body.aciklama, body.gorsel_url, body.hizmet_veren_id,
        body.sponsor_ad, body.hedef_url, body.siralama, body.baslangic, body.bitis,
    )
    return Campaign(**dict(row))
