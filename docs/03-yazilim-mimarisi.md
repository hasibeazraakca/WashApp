# WashApp — Yazılım Mimarisi & Mühendislik

> **Doküman sahibi:** Yazılım Mimarisi & Mühendislik
> **Durum:** LOOP-1 / Üçüncü ajan çıktısı — Finansal model, DevOps ve ekip için referans
> **Tarih:** 2026-06-30
> **Sabit stack (karar verildi):** React Native (2 app) · Python/FastAPI @ Render.com · Supabase (Postgres + Auth + Storage + PostGIS + RLS) · Iyzico/PayTR escrow
> **Önceki referanslar:** `docs/01-pazarlama-urun.md` (PR-1..PR-15, event taxonomy, fiyat sabitleri) · `docs/02-veri-mimarisi.md` (şema, RLS, trigger, ledger, partition)

---

## 0. Yönetici Özeti (mühendislik kararları)

1. **Mobil: bare React Native + custom dev client (Expo SDK + EAS), TEK monorepo.** İki app (`apps/customer`, `apps/provider`) + paylaşılan `packages/*`. "Expo mı bare mı" kararı = **Expo prebuild ile bare/dev-client melez**: Expo'nun build/OTA/EAS konforu + native modül özgürlüğü (in-app kamera, frame processor, native crypto). Saf managed Expo'yu **eliyoruz** çünkü anti-fraud kamera için native kontrol şart.
2. **Navigasyon: React Navigation 7 (native-stack).** State: **Zustand** (UI/oturum yerel state) + **TanStack Query (React Query)** (sunucu state/cache/retry). Redux'a gerek yok. Realtime için Supabase Realtime client.
3. **Harita: react-native-maps (Google Maps provider).** Kamera: **react-native-vision-camera** (frame-level kontrol, galeri yüklemesi imkânsız — anti-fraud omurgası). Native crypto: react-native-quick-crypto (istemci SHA-256).
4. **Backend: FastAPI (async) @ Render.** Topoloji: **1 web service** (API + webhook'lar) + **1 background worker** (5 cron görevi: 24s onay, NSM refresh, partition, payout, KVKK retention). Veri ajanının §10 cron listesi birebir.
5. **DB erişimi: HİBRİT.** (a) Mobil app → Supabase client (Auth + RLS korumalı `app.*` okuma + Realtime + Storage signed URL); (b) FastAPI → **doğrudan Postgres (asyncpg + SQLAlchemy 2.0)** üzerinden `service_role` ile `money.*`/`audit.*` ve tüm yazma/durum-geçiş işlemleri. **Para ve durum makinesi yalnızca FastAPI'den geçer; mobil app asla.**
6. **Bağlantı: Supavisor transaction pooler (port 6543) ZORUNLU** (veri ajanı kararı). FastAPI tarafında küçük `pool_size`, statement cache kapalı (pgbouncer/transaction-mode uyumu).
7. **Escrow = provizyon-then-capture taklidi.** Iyzico/PayTR 24s "gecikmeli capture" yerine: gün-0 provizyon (auth), onay/24s tetiklenince capture. Provizyon ömrü (7-30 gün) 24s'i fazlasıyla kapsar. Webhook idempotency (`unique(psp,psp_event_id)`) MUTLAK.
8. **Güvenlik: Supabase Auth JWT tek kimlik kaynağı.** Mobil app RLS ile korunur; backend yetki = `app_metadata.role` claim + service_role. Fotoğraf erişimi yalnızca 60 sn imzalı URL. KVKK: KYC belge erişimi tam denetim izi.

---

## 1. React Native Mimarisi

### 1.1 Expo vs bare — KARAR: Expo prebuild (bare workflow + dev-client + EAS)

| Seçenek | Artı | Eksi | Karar |
|---|---|---|---|
| Saf Managed Expo (Expo Go) | En hızlı başlangıç, OTA | **vision-camera frame processor, custom native crypto, arka plan konum çalışmaz** | ❌ ELENDİ |
| Saf Bare RN | Tam native özgürlük | Build/CI/imzalama elle, OTA yok, yavaş | ❌ Gereksiz acı |
| **Expo prebuild + dev-client + EAS** | Native modül özgürlüğü **+** EAS Build/Submit/Update (OTA), config plugin'ler | Hafif kurulum karmaşası | ✅ **SEÇİLDİ** |

**Gerekçe (WashApp'e özgü):** Anti-fraud omurgamızın kalbi "**yalnızca canlı in-app kamera**" (PR-2). Bu, `react-native-vision-camera`'nın frame processor'ına ve native modüllere ihtiyaç duyar — saf Expo Go bunu çalıştıramaz. Ama operasyon ekibi pilotta sık güncelleme isteyecek; EAS Update (OTA) ile JS-only düzeltmeleri store onayı beklemeden iteriz. Expo prebuild ikisini birleştirir: `app.config.ts` + config plugin'lerle native projeyi üretiriz, ihtiyaçta `ios/`–`android/` klasörlerini elle düzenleriz.

### 1.2 Monorepo stratejisi — KARAR: tek repo, 2 app, paylaşılan paketler

İki app'in **API sözleşmesi, tipler, tasarım sistemi, Supabase client'ı, durum makinesi sabitleri ortak**. Kod tekrarını önlemek ve sözleşme sürüklenmesini engellemek için tek monorepo.

```
washapp/                          # tek git repo (monorepo)
├── apps/
│   ├── customer/                 # Müşteri app (React Native, Expo prebuild)
│   │   ├── app.config.ts
│   │   ├── src/screens/          # Sipariş ver, takip, onay/itiraz, abonelik, cüzdan
│   │   └── eas.json
│   └── provider/                 # Hizmet Veren app
│       ├── app.config.ts
│       ├── src/screens/          # İş havuzu, varış, ÖNCESI/SONRASI kamera, kazanç
│       └── eas.json
├── packages/
│   ├── api-client/               # TanStack Query hook'ları + FastAPI sözleşmeleri (tek doğruluk kaynağı)
│   ├── supabase/                 # Supabase client init, Auth helper, Realtime abonelik
│   ├── types/                    # Paylaşılan TS tipleri (DB enum'ları, OrderStatus, DTO'lar)
│   ├── ui/                       # Tasarım sistemi (3 Kalkan rozetleri, buton, kart)
│   ├── camera-evidence/          # In-app kamera + GPS + hash + güvenli yükleme akışı (PR-2/3/4)
│   └── config/                   # Fiyat sabitleri, enum'lar, geofence poligonu
├── backend/                      # FastAPI (Python) — Render web service + worker
├── supabase/                     # migrations/, seed.sql (veri ajanı şeması)
├── package.json                  # workspaces
├── pnpm-workspace.yaml
└── turbo.json                    # Turborepo (build cache, task orchestration)
```

**Araç kararı:** **pnpm workspaces + Turborepo.** Metro'yu `metro.config.js`'te monorepo'ya işaret edecek şekilde ayarla (`watchFolders` = repo kökü, symlink çözümü). Yarn'a karşı pnpm: sıkı `node_modules`, disk verimi. Nx yerine Turborepo: RN için daha hafif.

> **Neden FastAPI da aynı monorepo'da?** Tip senkronizasyonu. `packages/types` TS tipleri, backend Pydantic modellerinden **OpenAPI → TS codegen** ile üretilir (`openapi-typescript`). API sözleşmesi tek yerden akar, sürüklenme olmaz.

### 1.3 Kütüphane kararları (gerekçeli)

| Alan | Kütüphane | Gerekçe (WashApp) |
|---|---|---|
| Navigasyon | **React Navigation 7 (native-stack)** | De-facto standart, native geçişler, deep-link (push'tan siparişe atlama) |
| Sunucu state | **TanStack Query v5** | Sipariş listesi/cüzdan cache, otomatik retry/refetch, optimistic update (durum geçişleri) |
| Yerel/UI state | **Zustand** | Hafif; oturum, aktif sipariş, kamera akış durumu. Redux boilerplate'ine gerek yok |
| Realtime | **Supabase Realtime (postgres_changes + presence)** | Sipariş durum değişimi & hizmet veren konumu canlı; ayrı socket altyapısı kurmaya gerek yok (§4.3) |
| Harita | **react-native-maps + Google Maps** | TR'de en iyi POI/trafik; mikro-bölge poligon overlay, hizmet veren pin'i |
| Kamera | **react-native-vision-camera v4** | **Anti-fraud omurgası:** frame processor, galeri bypass'ı imkânsız, çekim anında GPS damgası (§3) |
| Konum | **react-native-geolocation-service** + arka plan (`expo-location` task) | Hizmet veren canlı konum (15 sn), varış geofence |
| Crypto (hash) | **react-native-quick-crypto** | İstemci SHA-256 (fotoğraf değişmezlik kanıtı, JS crypto yavaş) |
| Bildirim | **Expo Notifications (FCM/APNs)** + SMS (Iletimerkezi/Netgsm backend'den) | Varış, öncesi-foto, onay penceresi uyarısı (PR-15) |
| Görsel sıkıştırma | **react-native-compressor** | Yükleme öncesi WebP/1080p (veri ajanı storage maliyeti kararı) |
| Form | **react-hook-form + zod** | Sipariş/onboarding formları; zod şeması backend ile paylaşılır |
| Hata izleme | **Sentry (RN + Python)** | Crash + performans; pilot kalite kritik |

### 1.4 İki app neden ayrı (tek değil)?

Müşteri ve hizmet veren **farklı kullanıcı, farklı izinler, farklı app store kategorisi, farklı bildirim profili**. Tek app + rol bazlı UI yerine ayrı binary:
- App store onayı/güncellemesi bağımsız (provider'da kamera/konum izinleri ağır, customer'da değil).
- Hizmet veren app'i sürekli arka plan konum + kamera ister; müşteriye bu izinleri sormak güveni düşürür.
- Kod paylaşımı zaten `packages/*` ile sağlanıyor — ayrı app olması tekrar yaratmıyor.

---

## 2. Python Backend Mimarisi (FastAPI @ Render)

### 2.1 Framework — KARAR: FastAPI

| Aday | Değerlendirme | Karar |
|---|---|---|
| **FastAPI** | Async (escrow/PSP I/O-bound), Pydantic v2 doğrulama, otomatik OpenAPI → TS codegen (monorepo tip akışı), starlette webhook'lar, hızlı | ✅ **SEÇİLDİ** |
| Django/DRF | Ağır, ORM bizim çift-girişli ledger/raw SQL ihtiyacına ters, async olgunlaşmamış | ❌ |
| Flask | Async/validation/OpenAPI elle kurulur, FastAPI bunu hazır verir | ❌ |

**Gerekçe:** WashApp backend'i **I/O-bound** (PSP API çağrıları, Supabase, Storage signed URL, push). Async FastAPI eşzamanlılığı ucuza verir. Pydantic, PSP webhook payload'larını ve API sözleşmelerini tek yerde doğrular. OpenAPI çıktısı `packages/types`'a codegen ile akar (sözleşme sürüklenmesi sıfır).

### 2.2 Render servis topolojisi

```
Render Project: washapp
├── washapp-api          (Web Service, FastAPI + Uvicorn/Gunicorn)
│     - REST API (mobil app'ler buraya gelir)
│     - PSP webhook endpoint'leri (/webhooks/iyzico, /webhooks/paytr)
│     - Storage signed upload/download URL üretimi
│     - Health check: /healthz
│     - Autoscale: pilotta 1 instance (Starter/Standard), Yıl-2'de 2+
│
├── washapp-worker       (Background Worker, APScheduler / arq)
│     5 zamanlanmış görev (veri ajanı §10):
│       (a) escrow_auto_confirm   her 60 sn  → 24s onay penceresi dolanları tamamla
│       (b) nsm_refresh           her saat   → REFRESH MATERIALIZED VIEW nsm_haftalik
│       (c) ensure_partitions     günlük     → gelecek ay audit.events partition aç
│       (d) payout_batch          günlük 04:00 → hizmet veren cüzdan → IBAN payout
│       (e) kvkk_retention        günlük 03:00 → saklama süresi dolmuş KYC/fotoğraf sil
│
└── (Supabase dışarıda: Postgres + Auth + Storage + Realtime)
```

**Karar — neden ayrı worker:** Cron görevleri (özellikle 24s onay taraması) web request'lerden bağımsız çalışmalı; web service'i bloklamamalı ve autoscale ile çoğalmamalı (cron yalnız **1 instance**'da koşmalı, yoksa payout çift çalışır). Render'da ayrı **Background Worker** = tek instance garantisi. Render Cron Jobs (ayrı tek-seferlik container) yerine sürekli worker + APScheduler/arq: 60 sn'lik görev için container spin-up maliyeti yok.

**Önemli kilit kararı:** Worker'da görevler **`SELECT ... FOR UPDATE SKIP LOCKED`** veya advisory lock ile koşar → ileride worker çoğalsa bile (yatay ölçek) aynı satır iki kez işlenmez (payout/onay idempotency).

### 2.3 Backend katman yapısı

```
backend/
├── app/
│   ├── main.py                # FastAPI app, router mount, middleware (CORS, Sentry, request-id)
│   ├── core/
│   │   ├── config.py          # Pydantic Settings (env: SUPABASE_*, IYZICO_*, fiyat sabitleri)
│   │   ├── db.py              # asyncpg pool + SQLAlchemy 2.0 (Supavisor 6543, pool_size=5)
│   │   ├── security.py        # JWT doğrulama (Supabase JWKS), rol kontrolü
│   │   └── supabase.py        # service_role client (Storage signed URL, Auth admin)
│   ├── domain/                # iş kuralları (saf Python, DB'siz test edilebilir)
│   │   ├── order_state.py     # durum makinesi yansıması (DB trigger ile çift güvence)
│   │   ├── escrow.py          # ledger satır üretimi (çift giriş)
│   │   ├── pricing.py         # fiyat sabitleri → sipariş anlık görüntüsü
│   │   └── dispatch.py        # KNN aday sıralama + demirleme
│   ├── api/v1/
│   │   ├── orders.py          # POST /orders, durum geçiş endpoint'leri
│   │   ├── evidence.py        # signed upload URL + hash doğrula + INSERT
│   │   ├── payments.py        # escrow başlat, iade
│   │   ├── webhooks.py        # /webhooks/iyzico, /webhooks/paytr (idempotent)
│   │   ├── dispatch.py        # dispatcher: aday listele, ata/override
│   │   ├── disputes.py        # itiraz aç/çöz
│   │   ├── subscriptions.py   # abonelik, hak düşümü
│   │   └── providers.py       # onboarding durum, KYC onay
│   ├── integrations/
│   │   ├── iyzico.py          # provizyon/capture/refund/payout SDK sarmalayıcı
│   │   ├── paytr.py           # alternatif PSP
│   │   ├── storage.py         # Supabase Storage signed URL + re-hash doğrulama
│   │   ├── push.py            # Expo/FCM push + SMS
│   │   └── kimlik_dogrulama.py# kimlik/adli sicil (e-Devlet/3.taraf — Faz teyit)
│   ├── workers/
│   │   ├── scheduler.py       # APScheduler tanımı (5 görev)
│   │   └── tasks.py           # her görev implementasyonu (SKIP LOCKED)
│   └── repositories/          # raw SQL (asyncpg) — ledger/order/evidence erişimi
├── tests/                     # pytest (domain saf, integration testcontainers-postgres)
├── requirements.txt / pyproject.toml
└── Dockerfile                 # Render deploy
```

### 2.4 DB erişimi — hangi işlem nerede (HİBRİT MODEL)

| İşlem | Erişim yolu | Gerekçe |
|---|---|---|
| Sipariş **okuma** (müşteri/HV kendi listesi) | **Mobil → Supabase client (RLS)** | RLS zaten "kendi siparişin" kuralını zorluyor (veri ajanı §2.3); backend'i araya koymaya gerek yok, hızlı |
| Sipariş **oluşturma + durum geçişi** | **Mobil → FastAPI → Postgres (service_role)** | Geofence kontrolü, fiyat snapshot, escrow tetikleme, durum makinesi → iş kuralı backend'de olmalı |
| **Para (money.*) her şey** | **YALNIZCA FastAPI → Postgres (service_role)** | money şeması RLS ile mobile kapalı (veri ajanı §2.1); ledger çift-giriş atomik olmalı |
| **Fotoğraf yükleme** | Mobil → FastAPI (signed URL al) → Storage (yükle) → FastAPI (hash doğrula + INSERT) | Anti-fraud: sunucu re-hash + service_role INSERT (PR-3) |
| **Fotoğraf görüntüleme** | Mobil → FastAPI (60 sn signed URL) | Kalıcı public URL yok (veri ajanı §3.5) |
| **Realtime** (durum/konum) | Mobil → Supabase Realtime (RLS-filtreli kanal) | Ayrı socket altyapısı yok (§4.3) |
| **Auth** (giriş/OTP) | Mobil → Supabase Auth doğrudan | Supabase Auth tek kimlik kaynağı |

> **Altın kural:** **Okuma → mümkünse Supabase RLS (hızlı, ucuz). Yazma + para + durum + iş kuralı → her zaman FastAPI (kontrol, denetim, atomiklik).** Mobil app `money.*`/`audit.*` şemalarına **asla** dokunmaz.

### 2.5 Bağlantı detayı (Supavisor)

```python
# backend/app/core/db.py — Supavisor transaction pooler
DATABASE_URL = "postgresql+asyncpg://postgres.<ref>:<pwd>@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"
engine = create_async_engine(
    DATABASE_URL,
    pool_size=5, max_overflow=5,      # Supavisor zaten multiplexliyor → küçük tut
    pool_pre_ping=True,
    connect_args={"statement_cache_size": 0,  # transaction pooler + asyncpg uyumu (prepared statement yok)
                  "server_settings": {"application_name": "washapp-api"}},
)
```

`service_role` ile bağlanırken her transaction başında RLS'i geçmek için `set role` gerekmez (service_role bypass eder); ancak **denetim için** kritik işlemlerde `audit.admin_actions`'a manuel log yazılır.

---

## 3. Kritik Akış (a): In-App Kamera + Öncesi/Sonrası Fotoğraf Kanıtı (PR-2/3/4)

### 3.1 Tasarım ilkesi: "Galeri yüklemesi teknik olarak imkânsız"

Anti-fraud güveni, fotoğrafın **o anda, o konumda, o cihazla çekildiğini** ispatlamaktan gelir. Bunu galeri seçimine asla izin vermeyerek + çok katmanlı damgayla sağlarız.

### 3.2 İstemci akışı (provider app — `packages/camera-evidence`)

```
1. Hizmet veren "VARDIM" → app GPS doğrular (plaza geofence içinde mi? PR-14)
2. Durum: varildi → backend onaylar
3. ÖNCESİ kamera ekranı açılır (vision-camera, galeri butonu YOK):
     - 6 zorunlu açı: on_sol, on_sag, arka_sol, arka_sag, jant, ic_torpido
     - Her kare için ekranda canlı şablon/hayalet overlay (doğru açıyı hizala)
     - Çekim anında: { foto, GPS(lat/lon/accuracy), cihaz_ts, order_id, hv_id, aci, evre }
4. İstemci: WebP sıkıştır (1080p) → SHA-256 hash hesapla (quick-crypto)
5. FastAPI: POST /evidence/upload-url { order_id, evre, aci, sha256, gps, cihaz_ts }
     → backend signed upload URL döner (Storage path: evidence/{order_id}/{evre}/{aci}.webp)
6. İstemci → Supabase Storage'a doğrudan PUT (signed URL)
7. İstemci → FastAPI POST /evidence/confirm { order_id, evre, aci, sha256 }
8. Backend: dosyayı Storage'tan oku → YENİDEN hash'le → istemci hash'iyle KARŞILAŞTIR
     - eşleşmezse 409, satır INSERT edilmez (kurcalama reddi)
     - eşleşirse: photo_evidence INSERT (service_role) + audit.event before_photos_submitted
9. 6 açı tamam → durum: oncesi_foto_ok (durum makinesi geçişi)
```

Sonrası fotoğraf akışı aynı; `evre='sonrasi'`, yıkama bitince. `unique(order_id, evre, aci)` her açının tek kez girilmesini DB'de garanti eder (veri ajanı §3.5).

### 3.3 Anti-fraud katmanları

| Katman | Mekanizma | Neyi engeller |
|---|---|---|
| **1. Sadece canlı kamera** | vision-camera; galeri/dosya picker app'te yok | Eski/başka araç fotoğrafı yükleme |
| **2. GPS damgası** | Çekim anında konum, plaza geofence içinde mi kontrol | Başka konumdan "uzaktan" kanıt |
| **3. Çift timestamp** | İstemci `cekim_ts` (EXIF) + güvenilir `sunucu_ts` | İstemci saatini geri alma |
| **4. SHA-256 + sunucu re-hash** | İstemci hash → sunucu yeniden hash → karşılaştır | Yükleme sırasında dosya değiştirme |
| **5. Append-only DB** | RLS UPDATE/DELETE yok + RULE do-instead-nothing (veri ajanı) | Sonradan kanıt silme/değiştirme |
| **6. cihaz_imza** | Cihaz attestation (Play Integrity / App Attest) opsiyonel token | Jailbreak/sahte istemci |
| **7. İmzalı kısa URL** | Görüntüleme 60 sn TTL, kalıcı URL yok | Kanıt sızması |

> **Karar:** Play Integrity / App Attest (cihaz_imza) MVP'de **best-effort** loglanır, bloklamaz (yanlış-pozitif pilotu yavaşlatmasın). Faz-2'de zorunlu hale gelir. Fotoğraf EXIF'inden GPS değil, **vision-camera'nın çekim anında okuduğu canlı GPS** kullanılır (EXIF taklit edilebilir).

### 3.4 Sunucu doğrulama sözleşmesi

```http
POST /api/v1/evidence/upload-url
Authorization: Bearer <supabase_jwt>
{
  "order_id": "uuid", "evre": "oncesi", "aci": "on_sol",
  "sha256": "9f86d08...", "gps": { "lat": 41.0827, "lon": 29.0095, "accuracy_m": 8 },
  "cihaz_ts": "2026-06-30T14:22:10.000Z"
}
→ 200 { "upload_url": "https://...signed...", "storage_path": "evidence/{id}/oncesi/on_sol.webp", "expires_in": 60 }
→ 403 { "error": "gps_disinda", "detay": "Konum plaza geofence dışında" }
```

---

## 4. Kritik Akış (b): Escrow + Iyzico/PayTR + Webhook (PR-5/6)

### 4.1 Escrow = "provizyon-then-capture" (KARAR)

Türkiye'de PSP'nin gerçek "emanet/24s gecikmeli capture" ürünü garanti değil. Bu yüzden escrow'u **provizyon (auth) + gecikmeli capture** ile taklit ederiz (veri ajanı §4.2 ile birebir):

```
gün-0  Sipariş onayı → Iyzico/PayTR PROVİZYON (auth) tutarı: gmv + koruma_fonu (465 TL)
       → kart bloke, para çekilmez. escrow_holds(durum='bloke'), ledger: escrow_hold
       → webhook auth_success → escrow doğrulanır
... hizmet → öncesi/sonrası foto → durum: musteri_onay (onay_penceresi_bitis = now+24s)
onay   Müşteri onayı VEYA 24s cron →
       → CAPTURE (provizyonu çek) → escrow_holds(durum='serbest')
       → ledger çift giriş: komisyon(+99 platform) + koruma_fonu(+15) + payout(+351 cüzdan)
       → durum: tamamlandi
itiraz Müşteri itiraz açarsa capture DURUR; dispute çözümüne kadar provizyon bloke kalır
       → platform_karsilar: iade (provizyon iptal) + koruma fonundan tazminat
```

**Provizyon ömrü riski:** Provizyon genelde 7-30 gün geçerli; 24s onay penceresini fazlasıyla kapsar. İtiraz uzarsa (provizyon süresi dolmadan) capture/iade kararı verilir; gerekirse provizyon yenilenir. **Yazılım ajanı (sonraki LOOP): Iyzico sözleşmesinde provizyon-capture ayrımı ve süresi netleştirilmeli.**

### 4.2 Webhook işleme (idempotent — MUTLAK)

```python
@router.post("/webhooks/iyzico")
async def iyzico_webhook(request: Request):
    raw = await request.body()
    if not verify_hmac(raw, request.headers["X-IYZ-SIGNATURE"]):   # imza doğrula
        raise HTTPException(401)
    evt = parse(raw)
    # IDEMPOTENCY: unique(psp, psp_event_id) → çift event no-op (veri ajanı §4.2)
    inserted = await repo.insert_webhook_event_if_new(
        psp="iyzico", psp_event_id=evt.event_id, event_type=evt.type,
        order_id=evt.order_id, raw=raw, imza_dogru=True)
    if not inserted:
        return {"status": "duplicate_ignored"}      # zaten işlendi
    async with db.transaction():                     # atomik
        await handle_payment_event(evt)              # capture/refund/payout ledger satırları
        await repo.mark_webhook_processed(evt.event_id)
    return {"status": "ok"}
```

**Kararlar:**
- HMAC imza doğrulaması **her webhook'ta zorunlu** (sahte capture/payout bildirimi engeli).
- `unique(psp, psp_event_id)` çakışırsa → daha önce işlendi → no-op (at-least-once webhook güvenli).
- Ledger yazımı + durum geçişi + webhook işaretleme **tek transaction** → kısmi başarı yok.
- Webhook 2 sn'de yanıt dön; ağır iş (push, payout) worker'a kuyruğa atılır.

### 4.3 Para güvenliği özeti

- `money.*` mobile **tamamen kapalı** (RLS); cüzdan/escrow yalnız FastAPI üzerinden özet okunur.
- Capture/payout iki adımlı: önce ledger (gerçek kaynak), sonra denormalize `wallets.bakiye` aynı transaction'da güncellenir.
- Payout worker'da: `SELECT ... FOR UPDATE SKIP LOCKED` ile cüzdan satırı kilitlenir → çift ödeme imkânsız.

---

## 5. Kritik Akış (c): Gerçek-Zamanlı Eşleştirme & Konum Takibi

### 5.1 KARAR: Supabase Realtime (ayrı socket altyapısı KURMA)

| Seçenek | Değerlendirme | Karar |
|---|---|---|
| **Supabase Realtime** (postgres_changes + presence + broadcast) | Stack'te zaten var, RLS-filtreli kanal, sıfır ek altyapı, pilot ölçeği fazlasıyla yeter | ✅ **SEÇİLDİ** |
| Kendi WebSocket (FastAPI + Redis pub/sub) | Esnek ama Redis+ölçek+RLS'i elle kur → pilotta gereksiz | ❌ Faz-3 (>2k eşzamanlı) |
| Firebase Realtime DB | İkinci vendor, stack dışı | ❌ |

### 5.2 Üç realtime kanalı

| Kanal | Mekanizma | Kim dinler |
|---|---|---|
| **Sipariş durumu** | `postgres_changes` on `app.orders` (RLS filtreli: kendi siparişi) | Müşteri (varış/foto/tamamlandı canlı), hizmet veren |
| **Hizmet veren konumu** | Realtime **broadcast/presence** (DB'ye her tick yazma yerine efemeral) | Müşteri (haritada yaklaşan pin), dispatcher |
| **Dispatch atama** | `postgres_changes` on `orders.hizmet_veren_id` | Hizmet veren ("yeni iş atandı") |

> **Performans kararı:** Hizmet veren konumu **her 15 sn DB'ye yazmak yerine** Realtime broadcast (efemeral) ile gönderilir → DB yazma yükü düşer. Yalnızca **eşleştirme anındaki** konum ve "demirleme" `app.hizmet_veren_konum`'a kalıcı yazılır (PostGIS KNN sorgusu için, veri ajanı §6.2). Canlı takip ≠ kalıcı kayıt.

### 5.3 Yarı-manuel dispatch (PR-11)

```
1. Sipariş oluştu (geofence OK) → backend KNN sorgusu (veri ajanı §6.2):
   en yakın 5 müsait + aktif + puan>=4.2, demirli plaza önce
2. Dispatcher panelinde 5 aday + algoritma önerisi (1. sıra) görünür
3. Dispatcher: kabul (auto) VEYA override (manual) → orders.hizmet_veren_id + dispatch_mode set
4. Realtime → hizmet veren app'inde "yeni iş" → kabul/red
5. audit.event: order_matched { dispatch_mode }
```

Pilotta dispatcher zorunlu (pazarlama kararı); Faz-2'de algoritma otomatik atar, dispatcher yalnız istisna yönetir. Backend her iki modu da destekler — sadece "otomatik onay" flag'i açılır.

---

## 6. Temel API Tasarımı

> Tüm endpoint'ler `Authorization: Bearer <supabase_jwt>`; rol `app_metadata.role`'dan okunur; yetkisiz → 403. Hata formatı: `{ "error": "kod", "detay": "mesaj" }`. snake_case JSON.

### 6.1 Ana endpoint tablosu

| Method · Path | Rol | Amaç |
|---|---|---|
| `POST /api/v1/orders` | musteri | Sipariş oluştur (geofence + fiyat snapshot + escrow provizyon) |
| `GET /api/v1/orders/{id}` | taraf | Sipariş detay (RLS; ağır listeleme Supabase'den) |
| `POST /api/v1/orders/{id}/arrive` | hizmet_veren | "Vardım" (geofence doğrula → varildi) |
| `POST /api/v1/evidence/upload-url` | hizmet_veren | İmzalı yükleme URL'i (PR-3) |
| `POST /api/v1/evidence/confirm` | hizmet_veren | Hash doğrula + INSERT |
| `POST /api/v1/orders/{id}/start-wash` | hizmet_veren | oncesi_foto_ok → yikama |
| `POST /api/v1/orders/{id}/confirm` | musteri | Müşteri onayı → capture → tamamlandi |
| `POST /api/v1/orders/{id}/dispute` | musteri | İtiraz aç (capture durur) |
| `POST /api/v1/dispatch/{id}/assign` | dispatcher | Aday ata/override |
| `GET /api/v1/dispatch/{id}/candidates` | dispatcher | KNN aday listesi |
| `POST /api/v1/disputes/{id}/resolve` | dispatcher/admin | İtiraz kararı + ledger (tazminat/rücu) |
| `POST /api/v1/subscriptions` | musteri | Abonelik başlat (recurring) |
| `POST /api/v1/providers/onboarding/{step}` | hizmet_veren | KYC belge/eğitim adımı |
| `POST /api/v1/webhooks/iyzico` · `/paytr` | (PSP) | Ödeme webhook (idempotent) |
| `GET /api/v1/wallet` | hizmet_veren | Cüzdan bakiyesi (money'den özet) |

### 6.2 Örnek: sipariş oluşturma

```http
POST /api/v1/orders
Authorization: Bearer <jwt>
{
  "arac_id": "uuid",
  "plaza_id": "uuid",
  "kat_park_no": "B2 - 142",
  "paket": "standart",
  "konum": { "lat": 41.0790, "lon": 29.0110 },
  "zaman_penceresi": "2026-06-30T15:00:00+03:00",
  "odeme_yontemi": "kayitli_kart_uuid",
  "subscription_kullan": false
}
```
```jsonc
// 201 Created
{
  "order_id": "uuid",
  "status": "olusturuldu",
  "fiyat": { "gmv": 450.00, "komisyon_orani": 0.220, "koruma_fonu": 15.00,
             "toplam_bloke": 465.00, "hizmet_veren_eline": 351.00 },
  "escrow": { "durum": "bloke", "psp": "iyzico", "provizyon_id": "..." },
  "realtime_channel": "order:uuid"
}
// 403 { "error": "geofence_disinda", "detay": "Sipariş pilot bölge dışında" }
```

### 6.3 Örnek: müşteri onayı (capture tetikler)

```http
POST /api/v1/orders/{id}/confirm
→ 200 {
  "status": "tamamlandi",
  "confirm_type": "customer",
  "escrow": { "durum": "serbest", "captured": 465.00 },
  "ledger": [
    { "hareket": "komisyon", "hesap": "platform_komisyon", "tutar": 99.00 },
    { "hareket": "koruma_fonu_katki", "hesap": "koruma_fonu", "tutar": 15.00 },
    { "hareket": "payout", "hesap": "hizmet_veren_cuzdan", "tutar": 351.00 }
  ]
}
```

---

## 7. Güvenlik Mimarisi

### 7.1 Kimlik & yetki zinciri

```
Supabase Auth (telefon OTP + e-posta) → JWT { sub: auth.uid, app_metadata.role }
   │
   ├── Mobil app → JWT'yi taşır → Supabase RLS politikaları "kendi verisi" filtreler (veri ajanı §2)
   │
   └── FastAPI → JWT'yi Supabase JWKS ile DOĞRULAR (imza+exp) → rol claim okur → endpoint yetkisi
                 → DB'ye service_role ile bağlanır (RLS bypass) ama iş kuralı backend'de zorlanır
```

**Karar — role claim güvenliği:** `role` **yalnızca FastAPI** (service_role, Auth Admin API) tarafından `app_metadata`'ya yazılır. Kullanıcı `user_metadata`'yı değiştirebilir ama RLS `app_metadata`'ya bakar → **yetki yükseltme imkânsız** (veri ajanı §2.2). Onboarding tamamlanmadan hizmet veren rolü/aktiflik verilmez.

### 7.2 RLS ↔ backend ilişkisi (net sınır)

| Katman | Güven seviyesi | Sorumluluk |
|---|---|---|
| **RLS (Supabase)** | Mobil app'in **okuma** güvenlik duvarı | "Kendi siparişin/aracın/fotoğrafın" — istemci doğrudan okusa bile sızıntı yok |
| **FastAPI (service_role)** | İş kuralı + yazma + para otoritesi | Durum geçişi, escrow, geofence, fiyat snapshot, KYC onay — RLS'i bypass eder ama kuralı kendi zorlar |
| **DB trigger** | Son savunma | `check_order_transition` geçersiz geçişi reddeder; `photo_evidence` RULE değişmezliği |

> İki bağımsız savunma: RLS (mobil sızıntıya karşı) + DB trigger/RULE (backend hatasına karşı). Backend bug'ı bile geçersiz durum geçişi yazamaz.

### 7.3 KVKK & şifreleme

| Veri | Önlem |
|---|---|
| KYC belgeleri (adli sicil, kimlik, ikametgah) | `evidence-kyc` private bucket; erişim yalnız admin/dispatcher + **her görüntüleme `audit.admin_actions`'a loglanır** (veri ajanı §7.2) |
| Fotoğraf kanıtı | private bucket, 60 sn signed URL, append-only |
| Kişisel veri (telefon, plaka) | TLS in-transit; Supabase at-rest şifreleme (AES-256); telefon E.164 |
| Saklama | KYC ve fotoğraf yasal saklama bitince **retention cron** siler (veri ajanı §10.e) |
| Aydınlatma onayı | `profiles.kvkk_onay_ts` — onaysız işlem başlatılamaz |
| Sır yönetimi | Tüm anahtarlar (service_role, IYZICO_SECRET) Render env var; repoda **asla**; rotasyon prosedürü |

### 7.4 Fotoğraf erişim kontrolü (özet)

İstemci asla kalıcı URL almaz. Görüntüleme → FastAPI yetki kontrolü (taraf mı / itirazda plaza mı / staff mi) → `createSignedUrl(60s)`. Bu sayede ekran görüntüsü dışında kanıt sızıntısı engellenir; itiraz panelinde dispatcher öncesi/sonrası yan-yana görür.

### 7.5 Ek güvenlik

- **Rate limit:** `/orders`, `/evidence`, `/webhooks` için IP + kullanıcı bazlı (slowapi).
- **Webhook imza:** HMAC zorunlu (§4.2).
- **Idempotency-Key:** mutasyon endpoint'lerinde (çift sipariş/çift onay önleme).
- **CORS:** yalnız app origin'leri / native (web admin için ayrı).
- **Sentry PII scrubbing:** plaka/telefon log'lara sızmaz.

---

## 8. Repo Yapısı, Ortamlar, CI/CD

### 8.1 Monorepo (özet — §1.2 detay)

Tek repo: `apps/{customer,provider}` + `packages/*` + `backend/` + `supabase/`. pnpm + Turborepo. Tip akışı: FastAPI OpenAPI → `openapi-typescript` → `packages/types`.

### 8.2 Ortamlar

| Ortam | Supabase | Render | Mobil |
|---|---|---|---|
| **dev** | Local Supabase (Docker) / dev proje | local uvicorn | EAS dev-client |
| **staging** | staging proje | washapp-api-staging | EAS preview (internal dağıtım) |
| **prod** | prod proje (pilot) | washapp-api + worker | EAS prod → TestFlight/Internal Testing → store |

Her ortam ayrı Supabase projesi + ayrı PSP (Iyzico sandbox/prod) + ayrı Render servis grubu. Fiyat sabitleri env'den (komisyon 0.220, koruma_fonu 15, abonelik 790/1490, AOV 450).

### 8.3 CI/CD (GitHub Actions + Render + EAS)

```
PR aç → GitHub Actions:
  - lint (ruff, eslint, tsc), pytest (domain + integration testcontainers-postgres)
  - supabase db diff → migration kontrol
  - openapi → types codegen drift kontrol (sözleşme sürüklenmiş mi)
main merge →
  - Backend: Render auto-deploy (Dockerfile), önce migration job (supabase db push), sonra api+worker
  - Mobil: EAS Build (staging) → internal dağıtım; tag ile prod EAS Submit
  - JS-only düzeltme → EAS Update (OTA, store beklemeden)
```

**Karar — migration disiplini:** Şema değişikliği **yalnız `supabase/migrations/`** üzerinden (veri ajanının CREATE TABLE'ları ilk migration). Prod'a deploy'da migration **api başlamadan önce** koşar (Render pre-deploy command). Geri alınamaz migration'lar (drop) için manuel onay gate'i.

---

## 9. MVP Geliştirme Fazları

| Faz | Süre | Kapsam | Çıktı |
|---|---|---|---|
| **F0 — İskele** | Hafta 1-2 | Monorepo, Supabase şema migration (veri ajanı), Auth, FastAPI iskelet, Render deploy, CI/CD | Boş ama deploy edilen 2 app + API |
| **F1 — Çekirdek akış** | Hafta 3-6 | Sipariş oluştur→durum makinesi, dispatch (yarı-manuel), **in-app kamera + kanıt (PR-2/3/4)**, geofence | Uçtan uca yıkama (parasız) demo |
| **F2 — Para** | Hafta 7-9 | **Escrow (Iyzico provizyon+capture), webhook idempotent, ledger, payout worker, koruma fonu** | Gerçek ödeme akışı |
| **F3 — Güven & kalite** | Hafta 10-12 | İtiraz akışı + öncesi/sonrası panel, puanlama + 4.2 askı, onboarding/KYC, 24s cron | Güven omurgası tam |
| **F4 — Gelir & pilot hazırlık** | Hafta 13-14 | Abonelik, bildirimler, B2B kurumsal kod (P1), dispatcher paneli, NSM dashboard | Pilot-ready |
| **F5 — Pilot & sertleştirme** | Hafta 15+ | Sentry izleme, yük testi, güvenlik review, OTA hotfix döngüsü | Maslak-Levent pilot canlı |

**Kritik yol (pazarlama §8 ile birebir):** PR-1 durum makinesi → PR-2/3/4 kamera kanıt → PR-5/6 escrow → PR-11 dispatch → PR-14 geofence. Para (F2) öncesi parasız uçtan uca akış (F1) doğrulanır.

### 9.1 Ekip (MVP — pilot)

| Rol | Sayı | Sorumluluk |
|---|---|---|
| Tech Lead / Backend | 1 | FastAPI, escrow/ledger, Supabase şema, mimari sahipliği |
| RN Mühendisi | 2 | customer + provider app, paylaşılan paketler (1 odak kamera/anti-fraud) |
| Backend/Entegrasyon | 1 | Iyzico/PayTR, webhook, KYC entegrasyon, worker |
| QA / Otomasyon | 0.5 | E2E (Detox), ödeme/itiraz senaryoları |
| DevOps (yarı) | 0.5 | Render, CI/CD, Supabase ortam, izleme |
| **Ürün/Dispatcher (operasyon)** | (pilot) | Yarı-manuel dispatch'i çalıştırır, ilk deneyimi cilalar (pazarlama §5.2) |

**Toplam: ~5 mühendis + operasyon.** Pilotu 14-15 haftada canlıya alır.

---

## 10. Açık Riskler & Bir Sonraki Ajana Devir

### 10.1 Açık teknik riskler (doğrulanmalı)

| Risk | Etki | Aksiyon |
|---|---|---|
| **Iyzico/PayTR provizyon-capture süresi & escrow uygunluğu** | Escrow modelinin temeli | PSP sözleşmesinde provizyon ömrü + capture ayrımı + payout (marketplace alt-üye işyeri) netleştir. Iyzico **"Pazaryeri/alt üye işyeri"** ürünü escrow'a en uygun aday |
| **Marketplace lisans/MASAK uyumu** | Para hizmet verene aktarımı | Iyzico marketplace çözümü kendi lisansı altında alt-üye işyeri ödemesi yapar → bizim lisansa gerek kalmaz; hukukla teyit |
| KYC/adli sicil entegrasyon kaynağı | Onboarding otomasyonu | e-Devlet/3.taraf KYC sağlayıcı (örn. kimlik doğrulama servisi) seç; MVP'de manuel admin onayı kabul |
| Play Integrity/App Attest yanlış-pozitif | Pilot yavaşlatma | MVP'de loglama-only, bloklamaz; Faz-2 zorunlu |
| Arka plan konum (iOS kısıtları) | Hizmet veren canlı takip | "demirleme" + foreground takip ile MVP yeterli; sürekli arka plan Faz-2 |

### 10.2 Devir notları

- **Finansal model ajanı:** Birim ekonomi (`money.ledger_entries` hesap-bazlı SUM) backend'den gerçek-zamanlı çekilebilir; servis maliyeti girdileri = **Render (api+worker ~$50-85/ay pilot), Supabase Pro ($25+kullanım), EAS ($99/ay), Iyzico komisyon ~%2.5, Sentry, push/SMS**. Bu sabit altyapı maliyeti pilot zarar modeline eklenmeli (~işlem başı dağıtılmış dispatch -12 TL ile tutarlı).
- **DevOps/sonraki yazılım turu:** İlk iş = (1) `supabase/migrations/0001_init.sql`'e veri ajanı CREATE TABLE+RLS+trigger'larını dök, (2) FastAPI iskelet + Supavisor bağlantı (port 6543, statement_cache=0), (3) webhook idempotency handler, (4) worker'da 5 cron + SKIP LOCKED.
- **Sözleşme:** §6 API tablosu + örnek JSON = RN api-client ve backend Pydantic modellerinin tek doğruluk kaynağı. OpenAPI codegen ile `packages/types`'a akacak.
- **Güvenlik:** Mobil yazma/para **asla** doğrudan Supabase'e değil FastAPI'ye; `money`/`audit` mobile kapalı. Bu sınır LOOP boyunca korunmalı.
- **Açık karar (PSP seçimi):** Iyzico vs PayTR — **Iyzico marketplace/alt-üye işyeri** escrow+payout için öncelikli aday; PayTR fallback. Bir sonraki tur netleştirmeli.
