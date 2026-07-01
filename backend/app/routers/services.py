"""Hizmet katalogu + randevu talepleri (0004_services.sql).

Yikama DISI hizmetler (yag/lastik/bakim/ic temizlik). Model:
  * randevu_modu=false hizmetler orders akisindan gecer (orders router, hizmet_id).
  * randevu_modu=true  hizmetler burada 'talep' olur (fotosuz; saglayici iletisim).

Altin kural: katalog LISTELEME okuma Supabase RLS'ten de yapilabilir; talep
OLUSTURMA yazma -> her zaman FastAPI (service_role). app.hizmet_talepleri INSERT
grant'i authenticated'a verilmez.
"""
from __future__ import annotations

import uuid as _uuid

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import settings
from app.core.db import get_db
from app.core.security import CurrentUser, CurrentUserDep, Role, require_roles
from app.core.supabase import (
    EVIDENCE_BUCKET,
    create_signed_upload_url,
    create_signed_url,
)
from app.domain import pricing
from app.domain.profiles import ensure_profile
from app.schemas import (
    MediaConfirmRequest,
    MediaItem,
    MediaUploadUrlResponse,
    Service,
    ServiceCategory,
    ServiceRequest,
    ServiceRequestCreate,
    ServiceRequestDetail,
    ServiceRequestQuote,
    ServiceRequestStatusUpdate,
)

router = APIRouter(prefix="/services", tags=["services"])

# Talep durum akisi (provider): yeni -> uslenildi -> teklif_verildi -> planlandi
#                                    -> yolda -> tamamlandi | iptal
_DURUM_SIRA = ["yeni", "uslenildi", "teklif_verildi", "planlandi", "yolda", "tamamlandi"]
_STATUS_HEDEFLERI = {"planlandi", "yolda", "tamamlandi", "iptal"}

# Talep detay (join'li) ortak SELECT
_TALEP_DETAY_SELECT = """
    SELECT t.id, t.hizmet_id, h.ad AS hizmet_ad, k.ad AS kategori_ad,
           t.arac_id, a.plaka, a.arac_tipi, t.plaza_id, p.ad AS plaza_ad,
           t.kat_park_no, t.notlar, t.tercih_zaman, t.tahmini_fiyat, t.fiyat_teklifi,
           t.durum, t.hizmet_veren_id, t.created_at
    FROM app.hizmet_talepleri t
    JOIN app.hizmetler h ON h.id = t.hizmet_id
    JOIN app.hizmet_kategorileri k ON k.id = h.kategori_id
    LEFT JOIN app.araclar a ON a.id = t.arac_id
    LEFT JOIN app.plazalar p ON p.id = t.plaza_id
"""

_HIZMET_COLS = """
    id, kategori_id, kod, ad, aciklama, taban_fiyat, sure_dk, ikon,
    foto_kanit_gerekli, randevu_modu, suv_ek, sira, aktif
"""


@router.get("/categories", response_model=list[ServiceCategory])
async def list_categories(
    user: CurrentUserDep,
    db: asyncpg.Connection = Depends(get_db),
) -> list[ServiceCategory]:
    """Aktif hizmet kategorileri (siralamaya gore)."""
    rows = await db.fetch(
        "SELECT id, kod, ad, ikon, sira, aktif FROM app.hizmet_kategorileri "
        "WHERE aktif = true ORDER BY sira DESC, ad"
    )
    return [ServiceCategory(**dict(r)) for r in rows]


@router.get("", response_model=list[Service])
async def list_services(
    user: CurrentUserDep,
    db: asyncpg.Connection = Depends(get_db),
) -> list[Service]:
    """Aktif hizmetler (tum kategoriler). Mobil bunu Supabase RLS'ten de okuyabilir."""
    rows = await db.fetch(
        f"SELECT {_HIZMET_COLS} FROM app.hizmetler WHERE aktif = true "
        "ORDER BY sira DESC, ad"
    )
    return [Service(**dict(r)) for r in rows]


@router.post("/requests", response_model=ServiceRequest, status_code=status.HTTP_201_CREATED)
async def create_service_request(
    body: ServiceRequestCreate,
    user: CurrentUser = Depends(require_roles(Role.MUSTERI)),
    db: asyncpg.Connection = Depends(get_db),
) -> ServiceRequest:
    """Randevu talebi olustur (randevu_modu hizmet — fotosuz akis).

    Fiyat tahmini katalogdan snapshot'lanir (gosterim). Foto/escrow YOK;
    operasyon/saglayici talebi 'iletildi'->'planlandi' ile ilerletir.
    """
    profil = await ensure_profile(db, user)
    if profil["kvkk_onay_ts"] is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "kvkk_onay_gerekli", "detay": "Once KVKK aydinlatma onayi verin (PATCH /me)"},
        )

    hizmet = await db.fetchrow(
        "SELECT id, taban_fiyat, randevu_modu, suv_ek, aktif FROM app.hizmetler WHERE id = $1",
        body.hizmet_id,
    )
    if hizmet is None or not hizmet["aktif"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "gecersiz_hizmet", "detay": "Hizmet yok veya pasif"},
        )
    if not hizmet["randevu_modu"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "randevu_disi_hizmet",
                    "detay": "Bu hizmet siparis akisindan gecer (POST /orders)"},
        )

    # Arac verildiyse dogrula (musteriye ait mi) + arac tipi (SUV eki)
    arac_tipi = "sedan"
    if body.arac_id is not None:
        arac = await db.fetchrow(
            "SELECT arac_tipi FROM app.araclar WHERE id = $1 AND musteri_id = $2",
            body.arac_id, user.user_id,
        )
        if arac is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "arac_bulunamadi", "detay": "Arac yok veya size ait degil"},
            )
        arac_tipi = arac["arac_tipi"]

    tahmini = pricing.hizmet_gmv(hizmet["taban_fiyat"], arac_tipi, suv_ek=hizmet["suv_ek"])
    lon = body.konum.lon if body.konum else None
    lat = body.konum.lat if body.konum else None

    row = await db.fetchrow(
        """
        INSERT INTO app.hizmet_talepleri
          (musteri_id, hizmet_id, arac_id, plaza_id, kat_park_no, notlar,
           tercih_zaman, tahmini_fiyat, konum)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                CASE WHEN $9::float8 IS NULL THEN NULL
                     ELSE ST_SetSRID(ST_MakePoint($9, $10), 4326)::geography END)
        RETURNING id, hizmet_id, arac_id, durum, tahmini_fiyat, tercih_zaman, created_at
        """,
        user.user_id, body.hizmet_id, body.arac_id, body.plaza_id, body.kat_park_no,
        body.notlar, body.tercih_zaman, tahmini, lon, lat,
    )
    return ServiceRequest(**dict(row))


# ---------------------------------------------------------------------------
# Provider (hizmet veren) is akisi — ustlen / fiyat / durum / medya
# ---------------------------------------------------------------------------
async def _load_talep(db: asyncpg.Connection, talep_id: str) -> asyncpg.Record:
    row = await db.fetchrow(_TALEP_DETAY_SELECT + " WHERE t.id = $1", talep_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "talep_bulunamadi", "detay": "Talep yok"},
        )
    return row


def _assert_claimer(row: asyncpg.Record, user: CurrentUser) -> None:
    if str(row["hizmet_veren_id"] or "") != user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "yetkisiz", "detay": "Bu talebi siz ustlenmediniz"},
        )


@router.get("/requests/open", response_model=list[ServiceRequestDetail])
async def list_open_requests(
    user: CurrentUser = Depends(require_roles(Role.HIZMET_VEREN, Role.DISPATCHER, Role.ADMIN)),
    db: asyncpg.Connection = Depends(get_db),
) -> list[ServiceRequestDetail]:
    """Acik (ustlenilmemis) randevu talepleri havuzu — provider ustlenebilir."""
    rows = await db.fetch(
        _TALEP_DETAY_SELECT
        + " WHERE t.durum = 'yeni' AND t.hizmet_veren_id IS NULL"
        + " ORDER BY t.created_at DESC LIMIT 50"
    )
    return [ServiceRequestDetail(**dict(r)) for r in rows]


@router.get("/requests/mine", response_model=list[ServiceRequestDetail])
async def list_my_requests(
    user: CurrentUser = Depends(require_roles(Role.HIZMET_VEREN)),
    db: asyncpg.Connection = Depends(get_db),
) -> list[ServiceRequestDetail]:
    """Provider'in ustlendigi talepler (aktif isler)."""
    rows = await db.fetch(
        _TALEP_DETAY_SELECT + " WHERE t.hizmet_veren_id = $1 ORDER BY t.created_at DESC LIMIT 50",
        user.user_id,
    )
    return [ServiceRequestDetail(**dict(r)) for r in rows]


@router.get("/requests/{talep_id}", response_model=ServiceRequestDetail)
async def get_request(
    talep_id: str,
    user: CurrentUser = Depends(require_roles(Role.HIZMET_VEREN, Role.MUSTERI, Role.DISPATCHER, Role.ADMIN)),
    db: asyncpg.Connection = Depends(get_db),
) -> ServiceRequestDetail:
    """Talep detay. Musteri yalniz kendi talebini; HV/staff havuzu gorebilir."""
    row = await _load_talep(db, talep_id)
    if user.role == Role.MUSTERI:
        owner = await db.fetchval("SELECT musteri_id FROM app.hizmet_talepleri WHERE id = $1", talep_id)
        if str(owner) != user.user_id:
            raise HTTPException(status_code=403, detail={"error": "yetkisiz", "detay": "Bu talep sizin degil"})
    return ServiceRequestDetail(**dict(row))


@router.post("/requests/{talep_id}/claim", response_model=ServiceRequestDetail)
async def claim_request(
    talep_id: str,
    user: CurrentUser = Depends(require_roles(Role.HIZMET_VEREN)),
    db: asyncpg.Connection = Depends(get_db),
) -> ServiceRequestDetail:
    """Talebi ustlen (yeni -> uslenildi). Yaris-guvenli: yalniz bos+yeni talep."""
    await ensure_profile(db, user)
    upd = await db.fetchrow(
        """
        UPDATE app.hizmet_talepleri
        SET hizmet_veren_id = $2, durum = 'uslenildi', updated_at = now()
        WHERE id = $1 AND durum = 'yeni' AND hizmet_veren_id IS NULL
        RETURNING id
        """,
        talep_id, user.user_id,
    )
    if upd is None:
        cur = await db.fetchval("SELECT durum FROM app.hizmet_talepleri WHERE id = $1", talep_id)
        if cur is None:
            raise HTTPException(status_code=404, detail={"error": "talep_bulunamadi", "detay": "Talep yok"})
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "talep_alinmis", "detay": f"Talep zaten '{cur}' durumunda"},
        )
    return ServiceRequestDetail(**dict(await _load_talep(db, talep_id)))


@router.post("/requests/{talep_id}/quote", response_model=ServiceRequestDetail)
async def quote_request(
    talep_id: str,
    body: ServiceRequestQuote,
    user: CurrentUser = Depends(require_roles(Role.HIZMET_VEREN)),
    db: asyncpg.Connection = Depends(get_db),
) -> ServiceRequestDetail:
    """Ustlenen provider fiyat verir (uslenildi/teklif_verildi -> teklif_verildi)."""
    row = await _load_talep(db, talep_id)
    _assert_claimer(row, user)
    if row["durum"] not in ("uslenildi", "teklif_verildi"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "gecersiz_durum", "detay": f"Fiyat '{row['durum']}' durumunda verilemez"},
        )
    await db.execute(
        "UPDATE app.hizmet_talepleri SET fiyat_teklifi = $2, durum = 'teklif_verildi', "
        "updated_at = now() WHERE id = $1",
        talep_id, body.fiyat,
    )
    return ServiceRequestDetail(**dict(await _load_talep(db, talep_id)))


@router.post("/requests/{talep_id}/status", response_model=ServiceRequestDetail)
async def update_request_status(
    talep_id: str,
    body: ServiceRequestStatusUpdate,
    user: CurrentUser = Depends(require_roles(Role.HIZMET_VEREN)),
    db: asyncpg.Connection = Depends(get_db),
) -> ServiceRequestDetail:
    """Durum ilerlet (planlandi/yolda/tamamlandi/iptal). Yalniz ileri gecis + iptal."""
    row = await _load_talep(db, talep_id)
    _assert_claimer(row, user)
    hedef = body.durum
    if hedef not in _STATUS_HEDEFLERI:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "gecersiz_durum", "detay": f"Durum: {', '.join(sorted(_STATUS_HEDEFLERI))}"},
        )
    mevcut = row["durum"]
    if mevcut == "tamamlandi" or mevcut == "iptal":
        raise HTTPException(status_code=409, detail={"error": "kapali_talep", "detay": f"Talep '{mevcut}'"})
    if hedef != "iptal":
        # ileri gecis: hedef indeksi mevcuttan buyuk olmali
        try:
            if _DURUM_SIRA.index(hedef) <= _DURUM_SIRA.index(mevcut):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={"error": "geri_gecis", "detay": f"'{mevcut}' -> '{hedef}' gecersiz"},
                )
        except ValueError:
            pass
    await db.execute(
        "UPDATE app.hizmet_talepleri SET durum = $2, updated_at = now() WHERE id = $1",
        talep_id, hedef,
    )
    return ServiceRequestDetail(**dict(await _load_talep(db, talep_id)))


@router.post("/requests/{talep_id}/media/upload-url", response_model=MediaUploadUrlResponse)
async def request_media_upload_url(
    talep_id: str,
    user: CurrentUser = Depends(require_roles(Role.HIZMET_VEREN)),
    db: asyncpg.Connection = Depends(get_db),
) -> MediaUploadUrlResponse:
    """Talep ilerleme fotosu icin imzali yukleme URL'i (ustlenen provider)."""
    row = await _load_talep(db, talep_id)
    _assert_claimer(row, user)
    path = f"talep/{talep_id}/{_uuid.uuid4().hex}.jpg"
    try:
        res = create_signed_upload_url(EVIDENCE_BUCKET, path)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail={"error": "storage_hatasi", "detay": "URL alinamadi"}) from exc
    upload_url = res.get("signed_url") or res.get("signedURL") or res.get("signedUrl") or ""
    return MediaUploadUrlResponse(upload_url=upload_url, storage_path=path, expires_in=7200)


@router.post("/requests/{talep_id}/media", response_model=MediaItem, status_code=status.HTTP_201_CREATED)
async def add_request_media(
    talep_id: str,
    body: MediaConfirmRequest,
    user: CurrentUser = Depends(require_roles(Role.HIZMET_VEREN)),
    db: asyncpg.Connection = Depends(get_db),
) -> MediaItem:
    """Yuklenen ilerleme fotosunu kaydet (yol dogrulama: bu talebe ait olmali)."""
    row = await _load_talep(db, talep_id)
    _assert_claimer(row, user)
    if not body.storage_path.startswith(f"talep/{talep_id}/"):
        raise HTTPException(status_code=400, detail={"error": "gecersiz_yol", "detay": "storage_path bu talebe ait degil"})
    rec = await db.fetchrow(
        """
        INSERT INTO app.talep_medya (talep_id, hizmet_veren_id, storage_path, asama, aciklama)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, storage_path, asama, aciklama, created_at
        """,
        talep_id, user.user_id, body.storage_path, body.asama, body.aciklama,
    )
    try:
        signed = create_signed_url(EVIDENCE_BUCKET, rec["storage_path"], settings.evidence_signed_url_ttl)
    except Exception:  # noqa: BLE001
        signed = ""
    return MediaItem(id=rec["id"], signed_url=signed, asama=rec["asama"],
                     aciklama=rec["aciklama"], created_at=rec["created_at"])


@router.get("/requests/{talep_id}/media", response_model=list[MediaItem])
async def list_request_media(
    talep_id: str,
    user: CurrentUser = Depends(require_roles(Role.HIZMET_VEREN, Role.MUSTERI, Role.DISPATCHER, Role.ADMIN)),
    db: asyncpg.Connection = Depends(get_db),
) -> list[MediaItem]:
    """Talep medyasi (imzali goruntuleme URL'leri, 60 sn)."""
    rows = await db.fetch(
        "SELECT id, storage_path, asama, aciklama, created_at FROM app.talep_medya "
        "WHERE talep_id = $1 ORDER BY created_at",
        talep_id,
    )
    out: list[MediaItem] = []
    for r in rows:
        try:
            signed = create_signed_url(EVIDENCE_BUCKET, r["storage_path"], settings.evidence_signed_url_ttl)
        except Exception:  # noqa: BLE001
            signed = ""
        out.append(MediaItem(id=r["id"], signed_url=signed, asama=r["asama"],
                             aciklama=r["aciklama"], created_at=r["created_at"]))
    return out
