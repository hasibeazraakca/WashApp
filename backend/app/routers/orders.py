"""Siparis endpoint'leri — olusturma + durum makinesi gecisleri (§6.1).

Durum gecisleri DB trigger ile DE zorlanir (02-veri-mimarisi.md §3.4, app.check_order_transition)
— backend bu yansimayi destekler ama son savunma DB'dedir. Gecersiz gecis UPDATE 0 satir
etkiler veya trigger exception verir -> 409.

F1 (parasiz): create/get + arrive/start-wash/confirm/dispute durum gecisleri.
Para/escrow/ledger F2'de (confirm su an yalniz durumu tamamlandi yapar, capture YOK).
"""
from __future__ import annotations

import json
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.db import get_db
from app.core.security import CurrentUser, Role, require_roles
from app.domain import pricing
from app.domain.profiles import ensure_profile
from app.schemas import (
    ConfirmResponse,
    DisputeOpenRequest,
    EscrowDurum,
    EscrowOzet,
    FiyatSnapshot,
    Order,
    OrderCreate,
    OrderCreateResponse,
    OrderJob,
    StatusTransitionResponse,
)

router = APIRouter(prefix="/orders", tags=["orders"])

# Siparis detay icin ortak SELECT alanlari (konum geometrisi response'a girmez).
_ORDER_COLS = """
    id, musteri_id, hizmet_veren_id, arac_id, plaza_id, kat_park_no, paket,
    arac_tipi, gmv, komisyon_orani, koruma_fonu, hizmet_veren_eline,
    status, dispatch_mode, onay_penceresi_bitis, created_at
"""


def _fiyat(row: asyncpg.Record) -> FiyatSnapshot:
    """orders satirindan donmus fiyat snapshot'ini yeniden kur."""
    gmv = row["gmv"]
    fon = row["koruma_fonu"]
    return FiyatSnapshot(
        gmv=gmv,
        komisyon_orani=row["komisyon_orani"],
        koruma_fonu=fon,
        toplam_bloke=gmv + fon,
        hizmet_veren_eline=row["hizmet_veren_eline"],
    )


def _to_order(row: asyncpg.Record) -> Order:
    return Order(
        order_id=row["id"],
        musteri_id=row["musteri_id"],
        hizmet_veren_id=row["hizmet_veren_id"],
        arac_id=row["arac_id"],
        plaza_id=row["plaza_id"],
        kat_park_no=row["kat_park_no"],
        paket=row["paket"],
        status=row["status"],
        dispatch_mode=row["dispatch_mode"],
        fiyat=_fiyat(row),
        escrow=None,  # F2: money.escrow_holds ozeti
        onay_penceresi_bitis=row["onay_penceresi_bitis"],
        realtime_channel=f"order:{row['id']}",
        created_at=row["created_at"],
    )


async def _load_order(db: asyncpg.Connection, order_id: UUID) -> asyncpg.Record:
    row = await db.fetchrow(
        f"SELECT {_ORDER_COLS} FROM app.orders WHERE id = $1", order_id
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "siparis_bulunamadi", "detay": "Siparis yok"},
        )
    return row


def _assert_party(row: asyncpg.Record, user: CurrentUser) -> None:
    """Taraf/staff yetki: musteri | atanan HV | dispatcher/admin."""
    if user.role in (Role.DISPATCHER, Role.ADMIN):
        return
    uid = user.user_id
    if str(row["musteri_id"]) == uid or str(row["hizmet_veren_id"] or "") == uid:
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={"error": "yetkisiz", "detay": "Bu siparisin tarafi degilsiniz"},
    )


# ---------------------------------------------------------------------------
# Olusturma
# ---------------------------------------------------------------------------
@router.post("", response_model=OrderCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_order(
    body: OrderCreate,
    user: CurrentUser = Depends(require_roles(Role.MUSTERI)),
    db: asyncpg.Connection = Depends(get_db),
) -> OrderCreateResponse:
    """Siparis olustur: geofence + fiyat snapshot + INSERT (§6.2).

    F1 akisi (parasiz):
      1. Profil garanti (FK) + KVKK onayi zorunlu.
      2. Paket gecerli mi + araci dogrula (musteriye ait mi, arac_tipi).
      3. Geofence: konum aktif pilot poligon icinde mi (ST_Within) -> degilse 403.
      4. pricing.paket_gmv + compute_snapshot (komisyon 0.22, koruma fonu 15).
      5. orders INSERT (status=olusturuldu, fiyat donduruldu) + audit order_created.
    Escrow provizyon (Iyzico) F2'de eklenir.
    """
    # 1) Profil + KVKK
    profil = await ensure_profile(db, user)
    if profil["kvkk_onay_ts"] is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "kvkk_onay_gerekli", "detay": "Once KVKK aydinlatma onayi verin (PATCH /me)"},
        )

    # 2) Hizmet/paket dogrula
    #    hizmet_id verildiyse fiyat katalogdan turetilir (randevu_modu=false sart:
    #    randevu hizmetleri /service-requests akisindan gecer, orders'tan DEGIL).
    hizmet = None
    if body.hizmet_id is not None:
        hizmet = await db.fetchrow(
            """
            SELECT id, kod, taban_fiyat, randevu_modu, suv_ek, aktif
            FROM app.hizmetler WHERE id = $1
            """,
            body.hizmet_id,
        )
        if hizmet is None or not hizmet["aktif"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "gecersiz_hizmet", "detay": "Hizmet yok veya pasif"},
            )
        if hizmet["randevu_modu"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "randevu_hizmeti",
                        "detay": "Bu hizmet randevu akisindan gecer (POST /service-requests)"},
            )
    elif body.paket not in pricing.PAKET_FIYAT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "gecersiz_paket",
                    "detay": f"Paket: {', '.join(pricing.PAKET_FIYAT)}"},
        )
    arac = await db.fetchrow(
        "SELECT id, arac_tipi FROM app.araclar WHERE id = $1 AND musteri_id = $2",
        body.arac_id, user.user_id,
    )
    if arac is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "arac_bulunamadi", "detay": "Arac yok veya size ait degil"},
        )

    # Plaza var mi? (siparis plazaya bagli — geofence + dispatch)
    plaza = await db.fetchval("SELECT 1 FROM app.plazalar WHERE id = $1", body.plaza_id)
    if plaza is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "plaza_bulunamadi", "detay": "Gecersiz plaza_id"},
        )

    # 3) Geofence — konum aktif pilot poligon icinde mi (02-veri §6.1)
    icinde = await db.fetchval(
        """
        SELECT EXISTS (
          SELECT 1 FROM geo.hizmet_bolgeleri b
          WHERE b.aktif
            AND ST_Within(
                  ST_SetSRID(ST_MakePoint($1, $2), 4326)::geometry,
                  b.alan::geometry)
        )
        """,
        body.konum.lon, body.konum.lat,
    )
    if not icinde:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "geofence_disinda", "detay": "Siparis pilot bolge disinda"},
        )

    # 4) Fiyat snapshot (donmus) — katalog hizmeti varsa taban_fiyat'tan, yoksa paket
    if hizmet is not None:
        gmv = pricing.hizmet_gmv(
            hizmet["taban_fiyat"], arac["arac_tipi"], suv_ek=hizmet["suv_ek"]
        )
        paket_kod = hizmet["kod"]
        hizmet_id = hizmet["id"]
    else:
        gmv = pricing.paket_gmv(body.paket, arac["arac_tipi"])
        paket_kod = body.paket
        hizmet_id = None
    snap = pricing.compute_snapshot(gmv)

    # 5) INSERT + audit (tek transaction)
    async with db.transaction():
        row = await db.fetchrow(
            """
            INSERT INTO app.orders
              (musteri_id, arac_id, plaza_id, kat_park_no, paket, hizmet_id, arac_tipi,
               gmv, komisyon_orani, koruma_fonu, hizmet_veren_eline, status, konum)
            VALUES ($1, $2, $3, $4, $5, $6, $7,
                    $8, $9, $10, $11, 'olusturuldu',
                    ST_SetSRID(ST_MakePoint($12, $13), 4326)::geography)
            RETURNING id, status
            """,
            user.user_id, body.arac_id, body.plaza_id, body.kat_park_no,
            paket_kod, hizmet_id, arac["arac_tipi"],
            snap.gmv, snap.komisyon_orani, snap.koruma_fonu, snap.hizmet_veren_eline,
            body.konum.lon, body.konum.lat,
        )
        await db.execute(
            """
            INSERT INTO audit.events (event_type, order_id, actor_id, payload)
            VALUES ('order_created', $1, $2, $3::jsonb)
            """,
            row["id"], user.user_id,
            json.dumps({"paket": paket_kod, "gmv": float(snap.gmv),
                        "plaza_id": str(body.plaza_id)}),
        )

    return OrderCreateResponse(
        order_id=row["id"],
        status=row["status"],
        fiyat=snap,
        escrow=None,  # F2: Iyzico provizyon
        realtime_channel=f"order:{row['id']}",
    )


# ---------------------------------------------------------------------------
# Provider is havuzu — acik siparisler + self-claim
# ---------------------------------------------------------------------------
_ORDER_JOB_SELECT = """
    SELECT o.id AS order_id, o.paket, a.plaka, o.arac_tipi, o.plaza_id,
           p.ad AS plaza_ad, o.kat_park_no, o.gmv, o.hizmet_veren_eline,
           o.status, o.created_at
    FROM app.orders o
    LEFT JOIN app.araclar a ON a.id = o.arac_id
    LEFT JOIN app.plazalar p ON p.id = o.plaza_id
"""


@router.get("/open", response_model=list[OrderJob])
async def list_open_orders(
    user: CurrentUser = Depends(require_roles(Role.HIZMET_VEREN, Role.DISPATCHER, Role.ADMIN)),
    db: asyncpg.Connection = Depends(get_db),
) -> list[OrderJob]:
    """Atanmamis (olusturuldu) siparis havuzu — provider ustlenebilir (yikama akisi)."""
    rows = await db.fetch(
        _ORDER_JOB_SELECT
        + " WHERE o.status = 'olusturuldu' AND o.hizmet_veren_id IS NULL"
        + " ORDER BY o.created_at DESC LIMIT 50"
    )
    return [OrderJob(**dict(r)) for r in rows]


@router.get("/mine", response_model=list[OrderJob])
async def list_my_jobs(
    user: CurrentUser = Depends(require_roles(Role.HIZMET_VEREN)),
    db: asyncpg.Connection = Depends(get_db),
) -> list[OrderJob]:
    """Provider'a atanmis aktif siparisler (tamamlandi/iptal haric)."""
    rows = await db.fetch(
        _ORDER_JOB_SELECT
        + " WHERE o.hizmet_veren_id = $1 AND o.status NOT IN ('tamamlandi','iptal')"
        + " ORDER BY o.created_at DESC LIMIT 50",
        user.user_id,
    )
    return [OrderJob(**dict(r)) for r in rows]


@router.post("/{order_id}/claim", response_model=StatusTransitionResponse)
async def claim_order(
    order_id: UUID,
    user: CurrentUser = Depends(require_roles(Role.HIZMET_VEREN)),
    db: asyncpg.Connection = Depends(get_db),
) -> StatusTransitionResponse:
    """Siparisi self-ustlen (olusturuldu -> eslestirildi, hizmet_veren_id=me).

    Yaris-guvenli: yalniz atanmamis 'olusturuldu'. dispatch_mode='self'.
    Dispatcher atamasindan farkli olarak provider kendi alir (pazaryeri self-servis).
    """
    async with db.transaction():
        row = await db.fetchrow(
            """
            UPDATE app.orders
            SET hizmet_veren_id = $2, dispatch_mode = 'self', status = 'eslestirildi'
            WHERE id = $1 AND status = 'olusturuldu' AND hizmet_veren_id IS NULL
            RETURNING id, status
            """,
            order_id, user.user_id,
        )
        if row is None:
            cur = await db.fetchval("SELECT status FROM app.orders WHERE id = $1", order_id)
            if cur is None:
                raise HTTPException(status_code=404, detail={"error": "siparis_bulunamadi", "detay": "Siparis yok"})
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"error": "alinamaz", "detay": f"Siparis '{cur}' durumunda (atanmamis olmali)"},
            )
        await db.execute(
            "INSERT INTO audit.events (event_type, order_id, actor_id, payload) "
            "VALUES ('order_matched', $1, $2, $3::jsonb)",
            order_id, user.user_id, json.dumps({"hizmet_veren_id": user.user_id, "mode": "self"}),
        )
    return StatusTransitionResponse(order_id=row["id"], status=row["status"])


@router.get("/{order_id}", response_model=Order)
async def get_order(
    order_id: UUID,
    user: CurrentUser = Depends(
        require_roles(Role.MUSTERI, Role.HIZMET_VEREN, Role.DISPATCHER, Role.ADMIN)
    ),
    db: asyncpg.Connection = Depends(get_db),
) -> Order:
    """Siparis detay (taraf kontrolu; agir listeleme Supabase RLS'ten — §2.4)."""
    row = await _load_order(db, order_id)
    _assert_party(row, user)
    return _to_order(row)


# ---------------------------------------------------------------------------
# Durum makinesi gecisleri
# ---------------------------------------------------------------------------
async def _transition(
    db: asyncpg.Connection,
    *,
    order_id: UUID,
    expected: str,
    yeni: str,
    where_extra: str = "",
    args: tuple = (),
) -> StatusTransitionResponse:
    """Guvenli durum gecisi: yalniz beklenen kaynaktan + ek kosul ile UPDATE.

    Etkilenen satir 0 ise mevcut durumu okuyup 409 dondur (yaris/yetki/gecersiz gecis).
    DB trigger (app.check_order_transition) gecis grafigini ayrica zorlar.
    """
    row = await db.fetchrow(
        f"""
        UPDATE app.orders
        SET status = $2::app.order_status
        WHERE id = $1 AND status = $3::app.order_status {where_extra}
        RETURNING id, status
        """,
        order_id, yeni, expected, *args,
    )
    if row is None:
        cur = await db.fetchval("SELECT status FROM app.orders WHERE id = $1", order_id)
        if cur is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "siparis_bulunamadi", "detay": "Siparis yok"},
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "gecersiz_durum",
                    "detay": f"Beklenen durum '{expected}', mevcut '{cur}'"},
        )
    return StatusTransitionResponse(order_id=row["id"], status=row["status"])


@router.post("/{order_id}/arrive", response_model=StatusTransitionResponse)
async def arrive(
    order_id: UUID,
    user: CurrentUser = Depends(require_roles(Role.HIZMET_VEREN)),
    db: asyncpg.Connection = Depends(get_db),
) -> StatusTransitionResponse:
    """'Vardim' — atanan HV: eslestirildi -> varildi (PR-14).

    Plaza GPS geofence dogrulamasi /evidence/upload-url adiminda zorlanir (oncesi foto).
    """
    return await _transition(
        db, order_id=order_id, expected="eslestirildi", yeni="varildi",
        where_extra="AND hizmet_veren_id = $4", args=(user.user_id,),
    )


@router.post("/{order_id}/start-wash", response_model=StatusTransitionResponse)
async def start_wash(
    order_id: UUID,
    user: CurrentUser = Depends(require_roles(Role.HIZMET_VEREN)),
    db: asyncpg.Connection = Depends(get_db),
) -> StatusTransitionResponse:
    """oncesi_foto_ok -> yikama (6 oncesi foto tamamlandiktan sonra, atanan HV)."""
    return await _transition(
        db, order_id=order_id, expected="oncesi_foto_ok", yeni="yikama",
        where_extra="AND hizmet_veren_id = $4", args=(user.user_id,),
    )


@router.post("/{order_id}/confirm", response_model=ConfirmResponse)
async def confirm_order(
    order_id: UUID,
    user: CurrentUser = Depends(require_roles(Role.MUSTERI)),
    db: asyncpg.Connection = Depends(get_db),
) -> ConfirmResponse:
    """Musteri onayi -> tamamlandi (§6.3).

    F1: yalniz durum gecisi (parasiz). F2'de Iyzico CAPTURE + ledger cift giris
    (komisyon + koruma_fonu_katki + payout) bu noktada tetiklenecek.
    """
    res = await _transition(
        db, order_id=order_id, expected="musteri_onay", yeni="tamamlandi",
        where_extra="AND musteri_id = $4", args=(user.user_id,),
    )
    return ConfirmResponse(
        status=res.status,
        confirm_type="customer",
        escrow=EscrowOzet(durum=EscrowDurum.SERBEST),  # F2: gercek capture
        ledger=[],
    )


@router.post("/{order_id}/dispute", response_model=StatusTransitionResponse)
async def open_dispute(
    order_id: UUID,
    body: DisputeOpenRequest,
    user: CurrentUser = Depends(require_roles(Role.MUSTERI)),
    db: asyncpg.Connection = Depends(get_db),
) -> StatusTransitionResponse:
    """Itiraz ac -> status=itiraz (§4.1). disputes router'i cozer.

    sonrasi_foto_ok veya musteri_onay durumundan acilabilir (capture beklemeye alinir).
    """
    row = await _load_order(db, order_id)
    if str(row["musteri_id"]) != user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "yetkisiz", "detay": "Yalniz siparis musterisi itiraz acabilir"},
        )
    if row["status"] not in ("sonrasi_foto_ok", "musteri_onay"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "gecersiz_durum",
                    "detay": "Itiraz yalniz sonrasi_foto_ok/musteri_onay durumunda acilir"},
        )
    async with db.transaction():
        try:
            await db.execute(
                """
                INSERT INTO app.disputes (order_id, acan_id, sebep, aciklama)
                VALUES ($1, $2, $3, $4)
                """,
                order_id, user.user_id, body.sebep, body.aciklama,
            )
        except asyncpg.UniqueViolationError as exc:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"error": "itiraz_zaten_var", "detay": "Bu siparis icin itiraz acik"},
            ) from exc
        res = await _transition(
            db, order_id=order_id, expected=row["status"], yeni="itiraz",
            where_extra="AND musteri_id = $4", args=(user.user_id,),
        )
    return res
