/**
 * @washapp/types — Paylasilan domain tipleri.
 *
 * Enum'lar docs/02-veri-mimarisi.md §3 SQL enum'lari ile BIREBIR (string degerleri
 * Turkce, DB ile ayni). DTO'lar docs/03-yazilim-mimarisi.md §6 API sozlesmesi ile uyumlu.
 *
 * NOT: Backend Pydantic modelleri OpenAPI -> openapi-typescript ile
 * src/generated/openapi.ts'e codegen edilir (tek dogruluk kaynagi). Buradaki eldeki
 * tipler iskele/erken gelistirme icindir; codegen geldikten sonra generated tipler esas alinir.
 */

// ---------------------------------------------------------------------------
// Roller (docs/02 §3.1 — app.user_role)
// ---------------------------------------------------------------------------

export const USER_ROLES = [
  "musteri",
  "hizmet_veren",
  "dispatcher",
  "plaza_yonetici",
  "admin",
] as const;
export type UserRole = (typeof USER_ROLES)[number];

// ---------------------------------------------------------------------------
// Siparis durum makinesi (docs/02 §3.4 — app.order_status) — BIREBIR
// ---------------------------------------------------------------------------

export const ORDER_STATUSES = [
  "olusturuldu",
  "eslestirildi",
  "varildi",
  "oncesi_foto_ok",
  "yikama",
  "sonrasi_foto_ok",
  "musteri_onay",
  "tamamlandi",
  "itiraz",
  "iptal",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Gecerli durum gecisleri — docs/02 §3.4 app.check_order_transition trigger'i ile BIREBIR.
 * Istemci yalnizca UI on-kontrolu icin kullanir; otorite DB trigger + backend'dir.
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  olusturuldu: ["eslestirildi", "iptal"],
  eslestirildi: ["varildi", "iptal"],
  varildi: ["oncesi_foto_ok", "iptal"],
  oncesi_foto_ok: ["yikama", "iptal"],
  yikama: ["sonrasi_foto_ok"],
  sonrasi_foto_ok: ["musteri_onay", "itiraz"],
  musteri_onay: ["tamamlandi", "itiraz"],
  tamamlandi: [],
  itiraz: ["tamamlandi", "iptal"],
  iptal: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

// ---------------------------------------------------------------------------
// Fotograf kanit enum'lari (docs/02 §3.5 — app.foto_evre / app.foto_aci)
// ---------------------------------------------------------------------------

export const PHOTO_PHASES = ["oncesi", "sonrasi"] as const;
export type PhotoPhase = (typeof PHOTO_PHASES)[number];

export const PHOTO_ANGLES = [
  "on_sol",
  "on_sag",
  "arka_sol",
  "arka_sag",
  "jant",
  "ic_torpido",
] as const;
export type PhotoAngle = (typeof PHOTO_ANGLES)[number];

// ---------------------------------------------------------------------------
// Diger domain enum'lari
// ---------------------------------------------------------------------------

export const ONBOARDING_STATUSES = [
  "basvuru",
  "belge_bekliyor",
  "incelemede",
  "egitim",
  "onayli",
  "reddedildi",
  "askida",
] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export const ORDER_PACKAGES = ["dis_hizli", "standart", "premium"] as const;
export type OrderPackage = (typeof ORDER_PACKAGES)[number];

export const VEHICLE_TYPES = ["sedan", "suv", "hatchback"] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const DISPATCH_MODES = ["auto", "manual"] as const;
export type DispatchMode = (typeof DISPATCH_MODES)[number];

export const DISPUTE_RESULTS = [
  "hizmet_veren_kusurlu",
  "musteri_reddedildi",
  "platform_karsilar",
  "beklemede",
] as const;
export type DisputeResult = (typeof DISPUTE_RESULTS)[number];

// ---------------------------------------------------------------------------
// Temel domain tipleri
// ---------------------------------------------------------------------------

export type UUID = string;
export type ISODateTime = string; // RFC3339, UTC saklanir
export type Currency = "TRY";

export interface GeoPoint {
  lat: number;
  lon: number;
  /** GPS dogruluk (metre) — anti-fraud geofence kontrolu (docs/03 §3). */
  accuracy_m?: number;
}

export interface Profile {
  id: UUID;
  role: UserRole;
  ad_soyad: string;
  telefon?: string; // E.164: +905xxxxxxxxx
  email?: string;
  kvkk_onay_ts?: ISODateTime;
}

export interface Vehicle {
  id: UUID;
  musteri_id: UUID;
  plaka: string;
  marka?: string;
  model?: string;
  renk?: string;
  arac_tipi: VehicleType;
}

export interface Plaza {
  id: UUID;
  ad: string;
  konum: GeoPoint;
  bolge_id?: UUID;
}

/** Siparis fiyat anlik goruntusu (docs/03 §6.2 — orders'a kopyalanir). */
export interface OrderPricing {
  gmv: number;
  komisyon_orani: number; // 0.220
  koruma_fonu: number; // 15.00
  toplam_bloke: number; // gmv + koruma_fonu
  hizmet_veren_eline: number; // gmv - komisyon
}

export interface Order {
  id: UUID;
  musteri_id: UUID;
  hizmet_veren_id?: UUID;
  arac_id: UUID;
  plaza_id?: UUID;
  kat_park_no?: string;
  paket: OrderPackage;
  arac_tipi: VehicleType;
  status: OrderStatus;
  dispatch_mode?: DispatchMode;
  pricing: OrderPricing;
  onay_penceresi_bitis?: ISODateTime;
  konum?: GeoPoint;
  subscription_id?: UUID;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface PhotoEvidence {
  id: UUID;
  order_id: UUID;
  hizmet_veren_id: UUID;
  evre: PhotoPhase;
  aci: PhotoAngle;
  storage_path: string;
  sha256: string;
  gps: GeoPoint;
  cekim_ts: ISODateTime;
  sunucu_ts: ISODateTime;
}

// ---------------------------------------------------------------------------
// Request / Response DTO'lar (docs/03 §6 ile uyumlu)
// ---------------------------------------------------------------------------

export interface CreateOrderRequest {
  arac_id: UUID;
  plaza_id: UUID;
  kat_park_no?: string;
  paket: OrderPackage;
  konum: GeoPoint;
  zaman_penceresi: ISODateTime;
  odeme_yontemi: string;
  subscription_kullan: boolean;
}

export interface CreateOrderResponse {
  order_id: UUID;
  status: OrderStatus;
  fiyat: OrderPricing;
  escrow: { durum: string; psp: string; provizyon_id?: string };
  realtime_channel: string;
}

export interface EvidenceUploadUrlRequest {
  order_id: UUID;
  evre: PhotoPhase;
  aci: PhotoAngle;
  sha256: string;
  gps: GeoPoint;
  cihaz_ts: ISODateTime;
}

export interface EvidenceUploadUrlResponse {
  upload_url: string;
  storage_path: string;
  expires_in: number;
}

/** Standart hata zarfi (docs/03 §6) — snake_case. */
export interface ApiError {
  error: string;
  detay: string;
}
