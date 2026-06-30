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


def _q(v: Decimal) -> Decimal:
    return v.quantize(_TWO, rounding=ROUND_HALF_UP)


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
