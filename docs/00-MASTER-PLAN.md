# WashApp — MASTER PLAN (İlk Plan / LOOP-1 Sentezi)

> **Belge No:** 00 · **Rol:** Baş Teknoloji & Strateji sentezi — 5 ajan çıktısının (01-pazarlama, 02-veri, 03-yazılım, 04-hukuk, 05-test) tek uygulanabilir master plana indirgenmesi.
> **Tarih:** 2026-06-30 · **Durum:** LOOP-1 kapanış — pilot mühendislik başlangıcı için onaylı plan.
> **Sabit stack (karar verildi, değiştirilemez):** React Native (2 app, Expo prebuild) · Python/FastAPI @ Render.com (Frankfurt) · Supabase (Postgres + Auth + Storage + PostGIS + RLS, Frankfurt/eu-central-1) · Iyzico Pazaryeri/Alt Üye İşyeri (PayTR fallback).
> **Bu belge kendi başına okunabilir.** Derinlik için: `01-pazarlama-urun.md`, `02-veri-mimarisi.md`, `03-yazilim-mimarisi.md`, `04-hukuk-risk.md`, `05-test-kalite.md`.

---

## 1. Yönetici Özeti

WashApp, araç sahibini (müşteri) seyyar yıkamacıyla (hizmet veren) buluşturan **varlık-hafif, kapıda mobil oto yıkama marketplace'idir** (Uber/Yemeksepeti modeli). İki React Native app (Müşteri + Hizmet Veren), Frankfurt'ta barınan Python/FastAPI backend (Render) ve Supabase (Postgres/PostGIS/Auth/Storage) üzerine inşa edilir; ödeme/escrow **lisanslı PSP Iyzico'nun Pazaryeri (alt üye işyeri + split payment) ürünüyle** kurulur — para hiçbir aşamada WashApp hesabına girmez. Rekabet farkımız **"3 Kalkan" güven omurgasıdır:** (A) sadece uygulama içi kamerayla GPS+zaman damgalı, SHA-256 imzalı, değiştirilemez öncesi/sonrası **fotoğraf kanıtı**; (B) müşteri onayı veya 24 saat otomatik onaya kadar parayı bloke tutan **escrow**; (C) işlem başı 15 TL'lik sözleşmesel **Hasar Tazmin Garanti Fonu** ("sigorta" değil). Kazanç modeli: **%22 sipariş komisyonu** (AOV 450 TL → ~99 TL/işlem) + B2C abonelik (790/1.490 TL) + B2B plaza/filo anlaşmaları. Pilot: **İstanbul Maslak–Levent–Büyükdere koridoru tek mikro-bölge**, kapalı otoparklı plazalar (susuz nano-solüsyon = hem yasal zorunluluk hem rekabet kalkanı). 90 gün hedefi: **60 aktif hizmet veren + 1.500 tamamlanmış işlem**; Kuzey Yıldızı = **haftalık itirazsız onaylanmış yıkama sayısı**.

---

## 2. Konsolide Ürün Kapsamı (MVP) — Tek Net Özellik Listesi

Pazarlama (M1–M10 / PR-1..PR-15) ve yazılım (F0–F5) uzlaşısı, hukuk düzeltmeleriyle revize edilmiş **tek kaynak** liste. Her madde sahip faz (§5) ile etiketli.

| # | Özellik (MVP must-have) | PR | Faz | Hukuk/Test düzeltmesi |
|---|---|---|---|---|
| 1 | **Sipariş durum makinesi** (DB-trigger zorlamalı): `olusturuldu → eslestirildi → varildi → oncesi_foto_ok → yikama → sonrasi_foto_ok → musteri_onay/24s_auto → tamamlandi / itiraz / iptal` | PR-1 | F1 | Geçersiz geçiş DB'de raise eder |
| 2 | **In-app kamera + öncesi/sonrası kanıt** (6 açı: 4 köşe + jant + iç). Galeri yüklemesi teknik olarak imkânsız; çekim anında canlı GPS + çift timestamp | PR-2/3/4 | F1 | Anti-fraud omurgası; B-1..B-6 testi |
| 3 | **Fotoğraf değişmezliği:** SHA-256 (istemci + sunucu re-hash) + append-only (RLS yok + Postgres RULE) + 60 sn imzalı URL | PR-3/4 | F1 | HMK m.193 delil sözleşmesi maddesiyle mahkeme değeri |
| 4 | **Geofence:** pilot poligonu (Büyükdere ekseni) dışında sipariş oluşturulamaz | PR-14 | F1 | C-1 testi |
| 5 | **Yarı-manuel dispatch:** KNN aday (en yakın 5 müsait, puan≥4.2, demirli plaza önce) + dispatcher override; **hizmet veren gerçek kabul/ret** (SGK karinesini kıran ret yolu zorunlu) | PR-11 | F1 | CELISKI-2 → "garanti" değil "teşvik" |
| 6 | **Escrow** (provizyon-then-capture): gün-0 auth → onay/24s'te capture+split. Para PSP havuzunda, WashApp'a hiç girmez | PR-5 | F2 | 6493 → PAY-1/PAY-2 (Iyzico submerchant) |
| 7 | **Ödeme & cüzdan & payout:** Iyzico alt üye işyeri, idempotent webhook (HMAC + unique(psp,event_id)), çift girişli ledger, payout batch | PR-6 | F2 | A-2/FR-8 testi; PSP fee'yi platform yüklenir |
| 8 | **Hasar Tazmin Garanti Fonu defteri:** işlem başı 15 TL fona; hasar ödeme + hizmet verene rücu; tazmin tavanlı | PR-7 | F2 | 5684 → "sigorta" dili yasak (SIG-1) |
| 9 | **İtiraz / hasar akışı:** öncesi/sonrası yan-yana panel → karar (`hizmet_veren_kusurlu` / `musteri_reddedildi` / `platform_karsilar`) | PR-10 | F3 | Tek sipariş = tek aktif itiraz (FR-2) |
| 10 | **İki taraflı puanlama + 4.2 eşik askıya alma** (otomatik askı + admin onayı; puan yalnız tamamlanmış siparişten) | PR-8 | F3 | FR-5 puan manipülasyon savunması |
| 11 | **Hizmet veren onboarding/KYC:** kimlik/ikametgah + **adli sicil doğrula-ve-at (≤7 gün, sonra boolean)** + ekipman foto/video + eğitim + **PSP submerchant başvurusu** | PR-9 | F3 | KVKK B2/ADLI-1 + PAY-2 (yeni adım) |
| 12 | **24s otomatik onay cron** (dakikalık tarama, SKIP LOCKED) | PR-5 | F3 | A-3 provizyon süresi telafisi |
| 13 | **Abonelik (2/4 yıkama):** kalan hak sayacı, otomatik yenileme, kota aşımı tek yıkama ücreti | PR-12 | F4 | FR-9 abonelik suistimali |
| 14 | **Bildirimler:** push (Expo/FCM) + SMS — varış, öncesi-foto, tamamlandı, onay-penceresi uyarısı | PR-15 | F4 | — |
| 15 | **B2B kurumsal kod** (plaza/filo indirim kodu, basit) — gelir paylaşım raporu P1 | PR-13 | F4 | Tam B2B paneli Faz-2 |
| 16 | **Dispatcher paneli + NSM dashboard** + operasyonel guardrail (itiraz oranı, varış süresi) | — | F4 | BOSLUK-2 eşikleri |

**Faz-2'ye ertelenenler:** AXA/Allianz gerçek grup poliçesi · tam otomatik dispatch · B2B yönetim paneli (toplu fatura/SLA) · hizmet veren premium üyelik · dinamik fiyat/referans · AI fotoğraf farkı tespiti · Play Integrity hard-block.

---

## 3. Sistem Mimarisi — Tek Bakış

```
┌──────────────────────────┐        ┌──────────────────────────┐
│   MÜŞTERİ APP (RN)        │        │  HİZMET VEREN APP (RN)    │
│  Expo prebuild + EAS      │        │  Expo prebuild + EAS      │
│  sipariş·takip·onay·itiraz│        │  iş havuzu·VARDIM·KAMERA  │
│  abonelik·cüzdan(özet)    │        │  öncesi/sonrası·kazanç    │
└───────┬───────────┬──────┘        └──────┬───────────┬───────┘
        │ OKUMA      │ YAZMA/PARA           │ YAZMA/PARA │ OKUMA
        │ (RLS)      │ (FastAPI)            │ (FastAPI)  │ (RLS)
        │            ▼                      ▼            │
        │   ┌─────────────────────────────────────┐    │
        │   │   FastAPI @ Render (Frankfurt)       │    │
        │   │   ── washapp-api (web service) ──    │    │
        │   │   REST + PSP webhook + signed URL    │    │
        │   │   geofence·fiyat snapshot·durum mak. │    │
        │   │   escrow tetik·ledger·KYC onay       │    │
        │   │   ── washapp-worker (5 cron) ──      │    │
        │   │   24s onay·NSM refresh·partition·    │    │
        │   │   payout batch·KVKK retention        │    │
        │   │   (SELECT FOR UPDATE SKIP LOCKED)    │    │
        │   └──┬───────────┬──────────────┬───────┘    │
        │      │service_role│ HMAC webhook │ signed URL  │
        ▼      ▼            ▼              ▼             ▼
┌─────────────────────────────┐  ┌──────────────────┐  (Realtime:
│   SUPABASE (Frankfurt)      │  │  IYZICO Pazaryeri │   postgres_changes
│  Postgres: app/money/audit/ │  │  (alt üye işyeri  │   + presence
│   geo şemaları + PostGIS    │◄─┤   + split payment)│   RLS-filtreli)
│  RLS · trigger · ledger     │  │  PARA BURADA TUTU-│
│  Auth (JWT, OTP)            │  │  LUR; WashApp'a   │
│  Storage: evidence(private) │  │  ASLA GİRMEZ      │
│   evidence-kyc(≤7gün geçici)│  │  PayTR = fallback │
└─────────────────────────────┘  └──────────────────┘
            │ rücu / tazmin
            ▼
┌──────────────────────────────────────────────┐
│  GARANTİ FONU (Faz-1: sözleşmesel, ledger     │
│  hesabı, tazmin tavanlı) → Faz-2: AXA/Allianz │
│  GRUP POLİÇESİ (gerçek sigortacı riski alır)  │
└──────────────────────────────────────────────┘
```

**Altın kural (LOOP boyunca korunur):** Okuma → mümkünse Supabase RLS (hızlı/ucuz). **Yazma + para + durum + iş kuralı → her zaman FastAPI** (service_role). Mobil app `money.*` ve `audit.*` şemalarına **asla** dokunmaz. Bağlantı: **Supavisor transaction pooler (port 6543), statement_cache=0**.

---

## 4. KRİTİK YOL — Hukuki Blokörler ve MVP'yi Nasıl Şekillendirdikleri

Üç hukuki blokör MVP mimarisini doğrudan belirledi. Her biri için **net karar** (seçenek sıralaması değil):

### 🔴 BLOKÖR 1 — Escrow lisansı (6493 sayılı Kanun) → KAPATMA riski
**Sorun:** Para WashApp hesabına girip bloke tutulursa = lisanssız ödeme/e-para faaliyeti = faaliyet durdurma + cezai sorumluluk.
**KARAR:** Para **hiçbir aşamada** WashApp hesabına girmez. Escrow, **Iyzico Pazaryeri / Alt Üye İşyeri (submerchant + split payment)** ürünüyle kurulur. Model = **provizyon (gün-0 auth) + onayda capture/split** — gerçek "24s gecikmeli capture" ürünü gerekmez; provizyon ömrü (7–30 gün) 24s onay penceresini fazlasıyla kapsar. Her hizmet veren **PSP nezdinde alt üye işyeri** olarak tanımlanır (onboarding'in zorunlu yeni adımı, PR-9). WashApp yalnızca komisyonu (kendi alt üye işyeri olarak) tahsil eder.
**MVP'yi nasıl şekillendirdi:** F2 (para fazı) F1'den (parasız uçtan uca akış) sonra gelir. Onboarding'e PSP submerchant başvurusu eklendi. **AÇIK RİSK (Loop-2 #1): Iyzico sandbox'ta auth→7gün→split capture'ın gerçekten çalıştığı PoC ile doğrulanmadan F2'ye girilmez.**

### 🔴 BLOKÖR 2 — Supabase yurt dışı veri + KVKK özel nitelikli veri → KAPATMA + ceza
**Sorun:** Adli sicil = özel nitelikli veri (KVKK m.6); Supabase yurt dışı = aktarım. Özel nitelikli verinin usulsüz yurt dışı aktarımı en ağır yaptırım senaryosu.
**KARAR (iki katmanlı lokalizasyon):**
- **Katman A (yurt dışı OK):** Sipariş, durum makinesi, araç fotoğrafı kanıtı, konum, ledger → Supabase **Frankfurt (eu-central-1)** + açık rıza + KVKK standart sözleşme (SCC) + Supabase/Render DPA. Render de Frankfurt'ta.
- **Katman B (yurt dışına asla çıkmaz):** Adli sicil + kimlik fotokopisi Supabase'e **kalıcı yüklenmez** → **"doğrula-ve-at"**: operatör belgeyi görür → karar verir → sisteme yalnızca `adli_sicil_dogrulandi(bool) + dogrulama_tarihi + dogrulayan_operator_id` yazılır; belge **≤7 gün içinde silinir** (audit logu kalır).
**MVP'yi nasıl şekillendirdi:** `evidence-kyc` bucket'ı **kalıcı değil ≤7 gün geçici** saklamaya çekildi (02-veri'deki tasarımın hukuk düzeltmesi). **6. cron eklendi:** evidence-kyc için **gün-bazlı retention** (önceki 5 cron'a ek — BOSLUK-1). Onay ekranı **katmanlı/granular rıza** (3 ayrı kutu: sözleşme / adli sicil / İYS); `kvkk_onay_ts`'e rıza tipi+versiyon+IP+timestamp yazılır. Faaliyet öncesi VERBİS + ETBİS + envanter + 72s ihlal prosedürü zorunlu.

### 🟠 BLOKÖR 3 — Garanti fonu (5684 sigortacılık) + Hizmet veren statüsü (SGK) → çifte tuzak
**Sorun A (5684):** 15 TL'yi havuzda toplayıp "hasarda öderiz" = prim toplama/risk üstlenme = lisanssız sigortacılık.
**KARAR A:** Fon **"sigorta" değil, sözleşmesel "Hasar Tazmin Garanti Fonu"** (ticari garanti). Prim/poliçe/risk havuzu dili **yasak**; pazarlama "güvence/koruma" der. **Tazmin tavanı net belirlenir** (danışman teyidiyle, ör. işlem başına sabit tavan). Faz-2'de hacim büyümeden gerçek AXA/Allianz **grup poliçesine** geçilir (sigortacı riski alır, lisans sorunu çözülür).
**Sorun B (SGK):** "Günde min 3 iş garantisi" + dispatch dayatması → bağımlılık karinesi → işçi sayılma → geriye dönük SGK/kıdem.
**KARAR B:** Hizmet veren = **bağımsız yüklenici** (TBK eser/hizmet). "Garanti" dili **kaldırılır** → "min. iş hacmi olan bölgeye demirleme + reddetme hakkı saklı arz teşviki". Dispatcher **öneri** sunar, hizmet veren **gerçek kabul/ret** eder (ürün akışı bunu fiilen desteklemeli — C-3 testi zorunlu). Münhasırlık yok, ekipman hizmet verenin, iş başına komisyon (maaş yok).
**MVP'yi nasıl şekillendirdi:** Dispatch akışına **gerçek ret yolu** + telemetri eklendi (sahte değilse risk gerçekleşir). Tüm dokümanlardan "garanti" dili temizlenecek (CELISKI-2). Fon = ledger hesabı, tazmin tavanlı.

> **Üçünün ortak şartı:** Bu belge avukat görüşü değil iç risk haritasıdır. Hukuk bürosundan **üç ayrı yazılı görüş** alınması ZORUNLU: (1) 6493 ödeme/escrow uyumu, (2) KVKK yurt dışı aktarım + özel nitelikli veri, (3) iş + sigorta hukuku (statü + fon yapısı, tazmin tavanı). Tüm tutar/süre/yapı bu teyitlerle kesinleşir.

---

## 5. Sprint Yol Haritası — MVP'ye Giden Fazlar

**Toplam: ~14–15 hafta + pilot · ekip ~5 mühendis + operasyon (dispatcher).** Kritik yol: PR-1 durum makinesi → PR-2/3/4 kamera → PR-5/6 escrow → PR-11 dispatch → PR-14 geofence. F1 parasız uçtan uca; F2 para.

| Faz | Süre | İş kalemleri | Sahip ajan/rol |
|---|---|---|---|
| **F0 — İskele** | Hafta 1–2 | Monorepo (pnpm+Turborepo, apps/customer + apps/provider + packages/*) · Supabase Frankfurt projesi + `supabase/migrations/0001_init.sql` (02-veri CREATE TABLE+RLS+trigger) · Supabase Auth · FastAPI iskelet + Supavisor 6543 · Render web+worker deploy · CI/CD (GitHub Actions, OpenAPI→TS codegen) | Tech Lead/Backend + DevOps |
| **F1 — Çekirdek akış (parasız)** | Hafta 3–6 | Sipariş oluştur + durum makinesi (PR-1) · geofence (PR-14) · yarı-manuel dispatch + KNN + **gerçek ret yolu** (PR-11) · **in-app kamera + GPS + hash + append-only kanıt (PR-2/3/4)** · Supabase Realtime (durum/konum) | RN Müh. (1 kamera odaklı) + Backend |
| **F2 — Para** | Hafta 7–9 | **Iyzico Pazaryeri/submerchant entegrasyonu** · escrow provizyon+capture/split · idempotent webhook (HMAC + unique) · çift girişli ledger · payout worker (SKIP LOCKED) · Garanti Fonu defteri (PR-5/6/7) | Backend/Entegrasyon + Tech Lead |
| **F3 — Güven & kalite** | Hafta 10–12 | İtiraz akışı + öncesi/sonrası panel (PR-10) · puanlama + 4.2 askı (PR-8) · onboarding/KYC **doğrula-ve-at** + PSP submerchant adımı (PR-9) · 24s otomatik onay cron + **evidence-kyc retention cron** (PR-5, BOSLUK-1) | Backend + RN Müh. + QA |
| **F4 — Gelir & pilot hazırlık** | Hafta 13–14 | Abonelik (PR-12) · bildirimler push/SMS (PR-15) · B2B kurumsal kod (PR-13, P1) · dispatcher paneli + NSM dashboard + guardrail eşikleri | RN Müh. + Backend + Ops |
| **F5 — Pilot & sertleştirme** | Hafta 15+ | Sentry izleme · yük testi (Locust webhook storm) · güvenlik review (RLS suite) · FR-1..FR-10 negatif test paketi · OTA hotfix döngüsü · **Maslak–Levent pilot canlı** | Tüm ekip + Ops dispatcher |

**Paralel hukuk/operasyon kulvarı (mühendislikten bağımsız, F0'da başlar):** Şirket kuruluşu · VERBİS + ETBİS kaydı · Iyzico Pazaryeri sözleşmesi (K4) · Supabase/Render DPA+SCC (K6) · D1–D10 kullanıcı sözleşme/aydınlatma/rıza metinleri · 3 hukuk bürosu görüşü · 5–7 plaza B2B ön-anlaşması.

---

## 6. "Bugün / Akşama Kadar" Başlanabilecek Somut İlk Adımlar

Eyleme dönük F0 kontrol listesi (sıralı, ilk gün–ilk hafta):

**Repo & monorepo iskeleti**
- [ ] `washapp` git monorepo oluştur: `apps/customer`, `apps/provider`, `packages/{api-client,supabase,types,ui,camera-evidence,config}`, `backend/`, `supabase/`.
- [ ] `pnpm-workspace.yaml` + `turbo.json` + kök `package.json` (workspaces) kur. Metro `watchFolders` = repo kökü.
- [ ] `packages/config`'e fiyat sabitleri: komisyon `0.220`, koruma_fonu `15.00`, abonelik `790`/`1490`, AOV `450`, geofence poligonu (Büyükdere ekseni koordinatları).

**Supabase (Frankfurt — KVKK kritik)**
- [ ] Supabase projesini **eu-central-1 (Frankfurt)** region'da aç (US değil — BLOKÖR 2).
- [ ] `supabase/migrations/0001_init.sql`'e 02-veri-mimarisi'ndeki tüm `CREATE TABLE` + 4 şema (app/money/audit/geo) + RLS politikaları + `app.check_order_transition` trigger + photo_evidence RULE'larını dök.
- [ ] PostGIS extension + GIST indeksler. `evidence` ve `evidence-kyc` private bucket (kyc ≤7 gün retention notu), `public-assets` public.
- [ ] `money.*` ve `audit.*` şemalarına RLS aç + **politika YOK** (service_role dışı kilitli) — SEC-1 testiyle doğrulanacak.

**FastAPI iskelet**
- [ ] `backend/` FastAPI + Uvicorn; `core/db.py` Supavisor `...pooler.supabase.com:6543`, `pool_size=5`, `statement_cache_size=0`.
- [ ] `core/security.py`: Supabase JWKS ile JWT doğrulama + `app_metadata.role` claim okuma.
- [ ] `/healthz` + boş router iskeleti (orders, evidence, payments, webhooks, dispatch, disputes, subscriptions, providers).
- [ ] Webhook idempotency handler iskeleti: HMAC doğrula → `money.psp_webhook_events` unique(psp,psp_event_id) → tek transaction.

**Worker (6 cron — BOSLUK-1 dahil)**
- [ ] `washapp-worker` (APScheduler/arq): (a) 24s onay (60sn), (b) NSM refresh (saatlik), (c) partition (günlük), (d) payout batch (04:00), (e) KVKK retention (03:00), **(f) evidence-kyc gün-bazlı doğrula-ve-at retention**. Hepsi `SELECT FOR UPDATE SKIP LOCKED`.

**Render & CI/CD**
- [ ] Render projesi (Frankfurt): `washapp-api` (web) + `washapp-worker` (background). Tüm sırlar Render env (service_role, IYZICO_SECRET) — repoda asla.
- [ ] GitHub Actions: ruff/eslint/tsc + pytest + `supabase db diff` + OpenAPI→TS drift kontrolü. Migration deploy api'den önce koşar.

**Hukuk/operasyon (paralel, bugün başlat)**
- [ ] Iyzico Pazaryeri/submerchant başvuru sürecini başlat + **sandbox PoC planı** (Loop-2 #1: auth→7gün→split capture).
- [ ] VERBİS/ETBİS başvuru hazırlığı + D1–D10 metin taslakları için hukuk bürosu brief'i.

---

## 7. Açık Kararlar & LOOP-2 Gündemi

Test ajanının (05) çapraz denetiminden çıkan 6 bulgu + çözüm durumu. **P0'lar pilot öncesi MUTLAK çözülür.**

| Sıra | Konu | Tip | Durum / Karar | Sahip |
|---|---|---|---|---|
| **1** 🔴 | **Iyzico provizyon/escrow PoC (CELISKI-1):** sandbox'ta auth→7gün→split/kısmi capture gerçekten çalışıyor mu? Çalışmazsa "platform havuzu" 6493 nedeniyle yasak → kısa provizyon + hızlandırılmış onay penceresine geçilir, tüm para akışı + 24s modeli yeniden tasarlanır | Yazılım↔Hukuk | **AÇIK — Loop-2 ilk iş. F2'ye girmeden kapanmalı.** G1/G2 kapısı buna bağlı | Yazılım + Finans + Hukuk |
| **2** 🔴 | **KYC retention cron (BOSLUK-1):** evidence-kyc gün-bazlı doğrula-ve-at cron'unun veri+yazılım dokümanına eklenmesi + KVKK-1 testinin yeşillenmesi | Veri↔Hukuk | **KARAR VERİLDİ (6. cron, §4 BLOKÖR-2), implementasyon F3'te.** KVKK özel nitelikli veri = kapatma | Veri + Yazılım |
| **3** 🟠 | **Ledger kalem dağılımı (BOSLUK-3):** PSP fee'yi kim yüklenir, provider net tam tutar, abonelik/B2B komisyon mantığı | Veri↔Finans | **KARAR (teyit bekliyor): PSP fee'yi platform yüklenir (komisyondan düşülür); provider net = 450 − 99(kom) − 15(fon) = 336 TL.** Finans ajanı teyit etsin | Finans + Veri |
| **4** 🟠 | **Dolandırıcılık test otomasyonu:** FR-1..FR-10'un çalıştırılabilir negatif test paketine (pgTAP + pytest + Maestro) dönüştürülmesi | Test | **AÇIK — F5'te paket, regresyon koruması** | Test/QA |
| **5** 🟠 | **SGK ret-yolu ürün akışı (CELISKI-2):** dispatcher öneri → hizmet veren gerçek kabul/ret UI + telemetri; "garanti" dilinin tüm dokümanlardan temizlenmesi | Pazarlama↔Hukuk | **KARAR VERİLDİ (§4 BLOKÖR-3), F1 dispatch'te uygulanır + dil temizliği Loop-2** | Ürün + Yazılım + Hukuk |
| **6** 🟠 | **Operasyonel guardrail eşikleri (BOSLUK-2):** itiraz oranı/varış süresi pilot telemetri tanımları + dashboard + alarm | Veri↔Ops | **KARAR: itiraz > %5 sarı, > %10 kırmızı (no-go); varış p50 < 25 dk.** Dashboard F4 | Veri + Ops |
| **7** 🟡 | **Kapalı otopark GPS güvenilirliği (BOSLUK-4):** drift toleransı vs mock-GPS (FR-6) dengesi; hibrit varış doğrulama (GPS + dispatcher manuel teyit) | Mobil↔Ops | **KARAR: MVP'de Play Integrity log-only + dispatcher manuel varış teyidi hibrit; flag'liler insan incelemesine. Faz-2 hard-block.** GPS ±150m/±5dk toleransı pilot telemetriyle kalibre | Mobil + Ops + Test |

### Go / No-Go kapısı (pilot lansmanı — 9 kapı, hiçbiri kırmızı olamaz)
G1 Para bütünlüğü (ledger invariant + Iyzico PoC) · G2 Escrow yasal modeli (para platforma girmiyor) · G3 Fotoğraf bütünlüğü (galeri/sahte GPS/replay bloke) · G4 KVKK özel nitelikli (doğrula-ve-at + Frankfurt + katmanlı rıza) · G5 RLS izolasyonu (money/audit mobile 0 satır) · G6 Garanti fonu yapısı (sigorta dili yok, tazmin tavanlı) · G7 Dolandırıcılık savunması (FR P0/P1 kapalı) · G8 Kalite eşikleri (kritik yol kapsama ≥%90, E2E ≥12 yeşil) · G9 Operasyonel guardrail (itiraz <%5, varış p50 <25dk, 72s runbook).
**Koşullu GO:** 0 kırmızı + en fazla 2 sarı (izleme planıyla).

---

*Belge sonu — 00-MASTER-PLAN.md · LOOP-1 sentezi. Loop-2'de Iyzico PoC sonucu §4 BLOKÖR-1 ve §7 #1'i, dolayısıyla G1/G2 kapısını günceller.*
