/**
 * @washapp/config — Fiyat sabitleri, enum'lar, geofence poligonu, env anahtar isimleri.
 *
 * Tek dogruluk kaynagi: docs/01-pazarlama-urun.md (fiyat sabitleri) +
 * docs/02-veri-mimarisi.md §10 (config sabitleri) + docs/03-yazilim-mimarisi.md §8.2.
 *
 * KRITIK: Bu sabitler siparis OLUSTURMA aninda orders satirina KOPYALANIR
 * (komisyon_orani, koruma_fonu). Sonradan fiyat degisse de eski siparis donar.
 * Mobil app yalnizca GOSTERIM icin okur; gercek hesap her zaman backend'de.
 */

// ---------------------------------------------------------------------------
// FIYAT SABITLERI (plan ile birebir — degistirilemez referans)
// ---------------------------------------------------------------------------

/** Platform komisyon orani (GMV uzerinden). Plan: 0.22 (=%22). */
export const COMMISSION_RATE = 0.22 as const;

/** Koruma fonu katki tutari (TL, islem basi sabit). Plan: 15.00 TL. */
export const PROTECTION_FUND_TRY = 15.0 as const;

/** Abonelik aylik ucretleri (TL). Plan: 2 yikama=790, 4 yikama=1490. */
export const SUBSCRIPTION_2_TRY = 790 as const;
export const SUBSCRIPTION_4_TRY = 1490 as const;

/** Ortalama sepet tutari / referans GMV (TL). Plan: 450 TL. */
export const AOV_TRY = 450 as const;

/** Hizmet veren askiya alma puan esigi (PR-8). */
export const PROVIDER_MIN_RATING = 4.2 as const;

/** SUV arac tipi fiyat carpani (+%15). docs/02 §3.2. */
export const SUV_SURCHARGE_RATE = 0.15 as const;

/** Musteri onay penceresi (saat) — 24s otomatik onay (PR-5). */
export const CONFIRM_WINDOW_HOURS = 24 as const;

/**
 * Referans fiyat tablosu — verilen GMV icin tek noktadan turetme.
 * Gercek (donmus) degerler her zaman backend pricing.py'den gelir; bu yalnizca
 * mobil gosterim ve tutarlilik testi icindir.
 */
export function priceBreakdown(gmv: number = AOV_TRY) {
  const commission = round2(gmv * COMMISSION_RATE);
  const providerPayout = round2(gmv - commission);
  const totalHold = round2(gmv + PROTECTION_FUND_TRY); // escrow bloke = gmv + koruma fonu
  return {
    gmv: round2(gmv),
    commissionRate: COMMISSION_RATE,
    commission, // ornek: 450 * 0.22 = 99.00
    protectionFund: PROTECTION_FUND_TRY, // 15.00
    providerPayout, // 450 - 99 = 351.00
    totalHold, // 450 + 15 = 465.00
  } as const;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// GEOFENCE — Pilot mikro-bolge poligonu (Buyukdere ekseni: Maslak-Levent)
// ---------------------------------------------------------------------------

/**
 * PLACEHOLDER poligon — Buyukdere Caddesi ekseni (Maslak ~ 4.Levent).
 * GeoJSON [lon, lat] sirasi (RFC 7946). Otorite poligon DB'de:
 * app.hizmet_bolgeleri.alan (geography(Polygon,4326)). Bu istemci kopyasi
 * yalnizca harita overlay/erken UX kontrolu icindir; gercek geofence
 * dogrulamasi backend ST_Within (docs/02 §6.1) ile yapilir.
 *
 * TODO(Faz-1): Kesin pilot poligon koordinatlarini operasyon ekibinden al,
 * supabase/migrations seed ile esitle.
 */
export const PILOT_GEOFENCE_POLYGON: {
  name: string;
  /** GeoJSON Polygon: tek halka, kapali (ilk == son), [lon, lat]. */
  coordinates: [number, number][];
} = {
  name: "Pilot: Buyukdere Ekseni",
  coordinates: [
    [29.0095, 41.1085], // Maslak kuzey
    [29.0205, 41.1015],
    [29.0225, 41.0825], // Levent dogu
    [29.0125, 41.0735], // 4.Levent guney
    [29.0035, 41.0825],
    [29.0045, 41.1015], // bati
    [29.0095, 41.1085], // kapanis
  ],
};

// ---------------------------------------------------------------------------
// ENV ANAHTAR ISIMLERI — tek yerde tanimli, app'ler bunlari okur
// ---------------------------------------------------------------------------

/**
 * Expo public env'leri (istemcide gomulur, app.config.ts -> extra).
 * Sir ICERMEZ: yalnizca anon key + public URL. service_role ASLA istemcide olmaz.
 */
export const ENV_KEYS = {
  SUPABASE_URL: "EXPO_PUBLIC_SUPABASE_URL",
  SUPABASE_ANON_KEY: "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  API_BASE_URL: "EXPO_PUBLIC_API_BASE_URL",
} as const;

/** Backend (FastAPI) env anahtarlari — yalnizca referans/dokumantasyon icin. */
export const BACKEND_ENV_KEYS = {
  DATABASE_URL: "DATABASE_URL", // Supavisor pooler, port 6543, statement_cache_size=0
  SUPABASE_SERVICE_ROLE_KEY: "SUPABASE_SERVICE_ROLE_KEY",
  SUPABASE_JWKS_URL: "SUPABASE_JWKS_URL",
  IYZICO_API_KEY: "IYZICO_API_KEY",
  IYZICO_SECRET: "IYZICO_SECRET",
  IYZICO_BASE_URL: "IYZICO_BASE_URL",
  PAYTR_MERCHANT_ID: "PAYTR_MERCHANT_ID",
  PAYTR_MERCHANT_KEY: "PAYTR_MERCHANT_KEY",
  SENTRY_DSN: "SENTRY_DSN",
} as const;

// ---------------------------------------------------------------------------
// Supabase baglanti notu (backend referansi — kodda kullanilmaz, sabit olarak tutulur)
// ---------------------------------------------------------------------------

/** Supavisor transaction pooler portu (ZORUNLU — docs/02 §8.5, docs/03 §2.5). */
export const SUPAVISOR_POOLER_PORT = 6543 as const;
/** Transaction pooler + asyncpg uyumu: prepared statement cache kapali. */
export const ASYNCPG_STATEMENT_CACHE_SIZE = 0 as const;
