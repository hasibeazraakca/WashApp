"""Pydantic v2 modelleri — API sozlesmesi (tek dogruluk kaynagi).

03-yazilim-mimarisi.md §6: OpenAPI -> openapi-typescript -> packages/types.
Enum'lar 02-veri-mimarisi.md §3 DB enum'larinin birebir yansimasi.
JSON snake_case (DB ile uyumlu). Fiyat alanlari Decimal (asla float).
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Enum'lar (DB enum yansimasi)
# ---------------------------------------------------------------------------
class OrderStatus(StrEnum):
    OLUSTURULDU = "olusturuldu"
    ESLESTIRILDI = "eslestirildi"
    VARILDI = "varildi"
    ONCESI_FOTO_OK = "oncesi_foto_ok"
    YIKAMA = "yikama"
    SONRASI_FOTO_OK = "sonrasi_foto_ok"
    MUSTERI_ONAY = "musteri_onay"
    TAMAMLANDI = "tamamlandi"
    ITIRAZ = "itiraz"
    IPTAL = "iptal"


class FotoEvre(StrEnum):
    ONCESI = "oncesi"
    SONRASI = "sonrasi"


class FotoAci(StrEnum):
    ON_SOL = "on_sol"
    ON_SAG = "on_sag"
    ARKA_SOL = "arka_sol"
    ARKA_SAG = "arka_sag"
    JANT = "jant"
    IC_TORPIDO = "ic_torpido"


class DispatchMode(StrEnum):
    AUTO = "auto"
    MANUAL = "manual"


class DisputeSonuc(StrEnum):
    HIZMET_VEREN_KUSURLU = "hizmet_veren_kusurlu"
    MUSTERI_REDDEDILDI = "musteri_reddedildi"
    PLATFORM_KARSILAR = "platform_karsilar"
    BEKLEMEDE = "beklemede"


class EscrowDurum(StrEnum):
    BLOKE = "bloke"
    SERBEST = "serbest"
    IADE = "iade"


# ---------------------------------------------------------------------------
# Ortak / yardimci modeller
# ---------------------------------------------------------------------------
class CamelModel(BaseModel):
    """Tum modeller icin ortak config (snake_case JSON, enum deger)."""

    model_config = ConfigDict(use_enum_values=True, from_attributes=True)


class GeoPoint(CamelModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    accuracy_m: float | None = Field(default=None, ge=0)


class ErrorResponse(CamelModel):
    """Standart hata formati (§6): { "error": "kod", "detay": "mesaj" }."""

    error: str
    detay: str | None = None


# ---------------------------------------------------------------------------
# Me / Profil
# ---------------------------------------------------------------------------
class MeResponse(CamelModel):
    """GET /me — dogrulanmis kullanicinin profili (tembel saglanir)."""

    id: UUID
    role: str
    ad_soyad: str
    telefon: str | None = None
    email: str | None = None
    kvkk_onay_ts: datetime | None = None
    created_at: datetime | None = None


class ProfileUpdateRequest(CamelModel):
    """PATCH /me — kullanici kendi profilini gunceller (ad/telefon/KVKK onay)."""

    ad_soyad: str | None = None
    telefon: str | None = Field(default=None, examples=["+905321234567"])
    kvkk_onay: bool | None = None  # true -> kvkk_onay_ts = now()


# ---------------------------------------------------------------------------
# Order
# ---------------------------------------------------------------------------
class OrderCreate(CamelModel):
    """POST /orders govdesi (§6.2)."""

    arac_id: UUID
    plaza_id: UUID
    kat_park_no: str | None = None
    paket: str = Field(..., examples=["dis_hizli", "standart", "premium"])
    # Katalog hizmeti (0004): verilirse fiyat katalogdan turetilir, paket = hizmet.kod.
    # Yalniz randevu_modu=false (foto+escrow) hizmetler bu akistan gecer.
    hizmet_id: UUID | None = None
    konum: GeoPoint
    zaman_penceresi: datetime | None = None
    odeme_yontemi: str | None = None  # kayitli kart token / psp ref
    subscription_kullan: bool = False


class FiyatSnapshot(CamelModel):
    """Siparise islem aninda kopyalanan fiyat (sonradan degismez — §6.2)."""

    gmv: Decimal
    komisyon_orani: Decimal
    koruma_fonu: Decimal
    toplam_bloke: Decimal
    hizmet_veren_eline: Decimal


class EscrowOzet(CamelModel):
    durum: EscrowDurum
    psp: str | None = None
    provizyon_id: str | None = None
    captured: Decimal | None = None


class Order(CamelModel):
    """Siparis detay yaniti."""

    order_id: UUID
    musteri_id: UUID
    hizmet_veren_id: UUID | None = None
    arac_id: UUID
    plaza_id: UUID | None = None
    kat_park_no: str | None = None
    paket: str
    status: OrderStatus
    dispatch_mode: DispatchMode | None = None
    fiyat: FiyatSnapshot | None = None
    escrow: EscrowOzet | None = None
    onay_penceresi_bitis: datetime | None = None
    realtime_channel: str | None = None
    created_at: datetime | None = None


class OrderCreateResponse(CamelModel):
    """201 — siparis olusturuldu (§6.2).

    escrow F2'de doldurulur (Iyzico provizyon); F1 parasiz akista None.
    """

    order_id: UUID
    status: OrderStatus
    fiyat: FiyatSnapshot
    escrow: EscrowOzet | None = None
    realtime_channel: str


class StatusTransitionResponse(CamelModel):
    order_id: UUID
    status: OrderStatus


class ConfirmResponse(CamelModel):
    """Musteri onayi / 24s otomatik onay -> capture (§6.3).

    escrow + ledger F2'de doldurulur; F1 parasiz onayda escrow=None, ledger=[].
    """

    status: OrderStatus
    confirm_type: str  # 'customer' | 'auto_24h'
    escrow: EscrowOzet | None = None
    ledger: list["LedgerLine"] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Evidence (PR-2/3/4)
# ---------------------------------------------------------------------------
class EvidenceUploadRequest(CamelModel):
    """POST /evidence/upload-url (§3.4)."""

    order_id: UUID
    evre: FotoEvre
    aci: FotoAci
    sha256: str = Field(..., min_length=64, max_length=64)
    gps: GeoPoint
    cihaz_ts: datetime


class EvidenceUploadResponse(CamelModel):
    upload_url: str
    storage_path: str
    expires_in: int


class EvidenceConfirmRequest(CamelModel):
    """POST /evidence/confirm — sunucu re-hash dogrulamasi (§3.2 adim 7-8).

    gps + cihaz_ts cekim aninda istemcide olusur; photo_evidence (NOT NULL) icin
    confirm ile tasinir (yetim metadata icin ayri pending tablo gerekmesin diye)."""

    order_id: UUID
    evre: FotoEvre
    aci: FotoAci
    sha256: str = Field(..., min_length=64, max_length=64)
    gps: GeoPoint
    cihaz_ts: datetime


class EvidenceConfirmResponse(CamelModel):
    accepted: bool
    evre: FotoEvre
    aci: FotoAci
    remaining: list[FotoAci] = Field(default_factory=list)  # eksik kalan acilar
    status: OrderStatus | None = None  # 6 aci tamamlandiysa yeni durum


class EvidenceViewResponse(CamelModel):
    """60 sn imzali goruntuleme URL'i (§7.4)."""

    signed_url: str
    expires_in: int


# ---------------------------------------------------------------------------
# Payments / Ledger
# ---------------------------------------------------------------------------
class LedgerLine(CamelModel):
    hareket: str  # money.hareket_tipi
    hesap: str  # money.hesap_tipi
    tutar: Decimal


class PaymentIntent(CamelModel):
    """Escrow provizyon baslatma (§4.1)."""

    order_id: UUID
    tutar: Decimal
    psp: str = "iyzico"
    odeme_yontemi: str | None = None


class PaymentIntentResponse(CamelModel):
    order_id: UUID
    escrow: EscrowOzet


class RefundRequest(CamelModel):
    order_id: UUID
    sebep: str | None = None


# ---------------------------------------------------------------------------
# Dispatch (PR-11)
# ---------------------------------------------------------------------------
class DispatchCandidate(CamelModel):
    hizmet_veren_id: UUID
    ortalama_puan: Decimal | None = None
    mesafe_m: float
    ayni_plaza: bool


class DispatchCandidatesResponse(CamelModel):
    order_id: UUID
    candidates: list[DispatchCandidate]
    onerilen: UUID | None = None  # algoritma 1. sira


class DispatchAssignRequest(CamelModel):
    hizmet_veren_id: UUID
    mode: DispatchMode = DispatchMode.MANUAL


# ---------------------------------------------------------------------------
# Disputes (PR-8/10)
# ---------------------------------------------------------------------------
class DisputeOpenRequest(CamelModel):
    sebep: str
    aciklama: str | None = None


class DisputeResolveRequest(CamelModel):
    sonuc: DisputeSonuc
    tazminat_tutar: Decimal | None = None
    not_: str | None = Field(default=None, alias="not")


class Dispute(CamelModel):
    id: UUID
    order_id: UUID
    sonuc: DisputeSonuc
    tazminat_tutar: Decimal | None = None


# ---------------------------------------------------------------------------
# Subscriptions (PR-12)
# ---------------------------------------------------------------------------
class SubscriptionCreate(CamelModel):
    plan: str = Field(..., examples=["2_yikama", "4_yikama"])
    odeme_yontemi: str | None = None


class Subscription(CamelModel):
    id: UUID
    plan: str
    aylik_ucret: Decimal
    kalan_hak: int
    durum: str


# ---------------------------------------------------------------------------
# Providers (PR-9 onboarding)
# ---------------------------------------------------------------------------
class OnboardingStepRequest(CamelModel):
    belge_tipi: str | None = None  # adli_sicil/kimlik/ikametgah/ekipman_video
    storage_path: str | None = None
    sha256: str | None = None


class ProviderStatus(CamelModel):
    profile_id: UUID
    durum: str
    aktif: bool
    ortalama_puan: Decimal | None = None
    eksik_adimlar: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Wallet
# ---------------------------------------------------------------------------
class WalletSummary(CamelModel):
    hizmet_veren_id: UUID
    bakiye: Decimal
    para_birimi: str = "TRY"


# ---------------------------------------------------------------------------
# Kampanyalar (reklam/sponsor — ana ekran banner)
# ---------------------------------------------------------------------------
class Campaign(CamelModel):
    """Kampanya kaydi (0003_campaigns.sql). tiklama_sayisi denormalize sayac."""

    id: UUID
    baslik: str
    aciklama: str | None = None
    gorsel_url: str
    hizmet_veren_id: UUID | None = None
    sponsor_ad: str | None = None
    hedef_url: str | None = None
    aktif: bool = True
    siralama: int = 0
    tiklama_sayisi: int = 0
    created_at: datetime | None = None


class CampaignCreate(CamelModel):
    """POST /campaigns (admin) — yeni kampanya olustur."""

    baslik: str = Field(..., min_length=1, max_length=200)
    gorsel_url: str = Field(..., min_length=1)
    aciklama: str | None = None
    hizmet_veren_id: UUID | None = None
    sponsor_ad: str | None = None
    hedef_url: str | None = None
    siralama: int = 0
    baslangic: datetime | None = None
    bitis: datetime | None = None


class CampaignClickResponse(CamelModel):
    """POST /campaigns/{id}/click — tiklama kaydedildi + guncel sayac."""

    kampanya_id: UUID
    tiklama_sayisi: int


# ---------------------------------------------------------------------------
# Hizmet katalogu (yikama disi: yag/lastik/bakim/ic temizlik) — 0004_services.sql
# ---------------------------------------------------------------------------
class ServiceCategory(CamelModel):
    id: UUID
    kod: str
    ad: str
    ikon: str = "grid"
    sira: int = 0
    aktif: bool = True


class Service(CamelModel):
    id: UUID
    kategori_id: UUID
    kod: str
    ad: str
    aciklama: str | None = None
    taban_fiyat: Decimal
    sure_dk: int | None = None
    ikon: str = "tool"
    foto_kanit_gerekli: bool = True
    randevu_modu: bool = False
    suv_ek: bool = True
    sira: int = 0
    aktif: bool = True


class ServiceRequestCreate(CamelModel):
    """POST /service-requests — randevu_modu hizmet talebi (fotosuz akis)."""

    hizmet_id: UUID
    arac_id: UUID | None = None
    plaza_id: UUID | None = None
    kat_park_no: str | None = None
    notlar: str | None = None
    tercih_zaman: datetime | None = None
    konum: GeoPoint | None = None


class ServiceRequest(CamelModel):
    id: UUID
    hizmet_id: UUID
    arac_id: UUID | None = None
    durum: str
    tahmini_fiyat: Decimal | None = None
    tercih_zaman: datetime | None = None
    created_at: datetime | None = None


class ServiceRequestDetail(CamelModel):
    """Provider is havuzu/detay — zengin talep gorunumu (join'li)."""

    id: UUID
    hizmet_id: UUID
    hizmet_ad: str | None = None
    kategori_ad: str | None = None
    arac_id: UUID | None = None
    plaka: str | None = None
    arac_tipi: str | None = None
    plaza_id: UUID | None = None
    plaza_ad: str | None = None
    kat_park_no: str | None = None
    notlar: str | None = None
    tercih_zaman: datetime | None = None
    tahmini_fiyat: Decimal | None = None
    fiyat_teklifi: Decimal | None = None
    durum: str
    hizmet_veren_id: UUID | None = None
    created_at: datetime | None = None


class ServiceRequestQuote(CamelModel):
    """POST /services/requests/{id}/quote — provider fiyat verir."""

    fiyat: Decimal = Field(..., gt=0)


class ServiceRequestStatusUpdate(CamelModel):
    """POST /services/requests/{id}/status — provider durum ilerletir."""

    durum: str = Field(..., examples=["planlandi", "yolda", "tamamlandi", "iptal"])


class OrderJob(CamelModel):
    """Provider is havuzu — atanmamis/atanmis siparis ozeti (yikama akisi)."""

    order_id: UUID
    paket: str
    plaka: str | None = None
    arac_tipi: str | None = None
    plaza_id: UUID | None = None
    plaza_ad: str | None = None
    kat_park_no: str | None = None
    gmv: Decimal
    hizmet_veren_eline: Decimal | None = None
    status: OrderStatus
    created_at: datetime | None = None


class MediaUploadUrlResponse(CamelModel):
    upload_url: str
    storage_path: str
    expires_in: int


class MediaConfirmRequest(CamelModel):
    storage_path: str
    asama: str | None = None
    aciklama: str | None = None


class MediaItem(CamelModel):
    id: UUID
    signed_url: str
    asama: str | None = None
    aciklama: str | None = None
    created_at: datetime | None = None


# Forward ref cozumleme
ConfirmResponse.model_rebuild()
