"""Fiyatlandirma — siparis anlik goruntusu (fiyat snapshot).

Plan sabitleri (config'ten): komisyon 0.22, koruma fonu 15.00 TL.
Bu degerler siparise ISLEM ANINDA kopyalanir (02-veri-mimarisi.md §10) — sonradan
fiyat degisse de eski siparis donar.

Ornek (AOV 450): toplam_bloke = 450 + 15 = 465; komisyon = 450 * 0.22 = 99;
hizmet_veren_eline = 450 - 99 = 351.
"""
from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from app.core.config import settings
from app.schemas import FiyatSnapshot

_TWO = Decimal("0.01")

# Paket liste fiyatlari (01-pazarlama-urun.md §4.1 — pilot, Istanbul premium).
# Tek dogruluk kaynagi: bu degerler siparise islem aninda kopyalanir (fiyat dondurma).
PAKET_FIYAT: dict[str, Decimal] = {
    "dis_hizli": Decimal("280.00"),
    "standart": Decimal("450.00"),  # varsayilan / AOV
    "premium": Decimal("750.00"),
}

# SUV / buyuk arac eki: tum paketlere +%15 (01-pazarlama §4.1).
SUV_EK_ORANI = Decimal("0.15")
SUV_ARAC_TIPLERI = frozenset({"suv"})


def _q(v: Decimal) -> Decimal:
    return v.quantize(_TWO, rounding=ROUND_HALF_UP)


def paket_gmv(paket: str, arac_tipi: str = "sedan") -> Decimal:
    """Paket + arac tipinden GMV (yikama bedeli) hesapla.

    Bilinmeyen paket -> KeyError (cagiran 400 dondurur).
    SUV ise +%15 ek uygulanir.
    """
    taban = PAKET_FIYAT[paket]
    if arac_tipi.lower() in SUV_ARAC_TIPLERI:
        taban = taban * (Decimal("1") + SUV_EK_ORANI)
    return _q(taban)


def hizmet_gmv(taban_fiyat: Decimal, arac_tipi: str = "sedan", *, suv_ek: bool = True) -> Decimal:
    """Katalog hizmetinin taban fiyatindan GMV hesapla (0004_services.sql).

    suv_ek=True ve arac SUV ise +%15 uygulanir (yikama/detay). Yag/lastik gibi
    parca-agirlikli hizmetlerde suv_ek=False (arac tipi fiyati etkilemez).
    """
    taban = Decimal(taban_fiyat)
    if suv_ek and arac_tipi.lower() in SUV_ARAC_TIPLERI:
        taban = taban * (Decimal("1") + SUV_EK_ORANI)
    return _q(taban)


def compute_snapshot(
    gmv: Decimal,
    *,
    commission_rate: Decimal | None = None,
    koruma_fonu: Decimal | None = None,
) -> FiyatSnapshot:
    """Verilen GMV icin fiyat snapshot uret (kopyalanacak donmus degerler)."""
    rate = commission_rate if commission_rate is not None else settings.commission_rate
    fon = koruma_fonu if koruma_fonu is not None else settings.koruma_fonu_tl

    gmv = _q(gmv)
    komisyon = _q(gmv * rate)
    hizmet_veren_eline = _q(gmv - komisyon)
    toplam_bloke = _q(gmv + fon)

    return FiyatSnapshot(
        gmv=gmv,
        komisyon_orani=rate,
        koruma_fonu=_q(fon),
        toplam_bloke=toplam_bloke,
        hizmet_veren_eline=hizmet_veren_eline,
    )
