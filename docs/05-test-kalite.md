# WashApp — Test, Kalite & Doğrulama Çerçevesi

> Sabit stack: React Native (Expo prebuild, 2 app) + Python/FastAPI @ Render + Supabase (Postgres/PostGIS/Auth/Storage) + Iyzico (PayTR fallback).
> Bu belge, önceki 4 ajanın (pazarlama / veri / yazılım / hukuk) çıktısını tek bir kalite kapısı altında birleştirir. Çelişki ve boşlukları tespit eder, dolandırıcılık vektörlerine karşı test senaryoları tanımlar, KVKK/güvenlik test maddelerini ve "go/no-go" eşiklerini koyar.

---

## 0. Yönetici Özeti (kalite kararları)

| # | Karar | Gerekçe |
|---|---|---|
| K1 | **Test piramidi 70/20/10** değil, WashApp'e özgü **60/25/15** (birim/entegrasyon/E2E) — para ve fotoğraf akışlarında entegrasyon ağırlığı artırıldı | Risk parada ve durum makinesinde, saf birim testle yakalanmaz |
| K2 | **Para ve durum makinesi akışları için "kanıt-tabanlı" kabul: her testte DB ledger bakiyesi 0'a denkleşmeli** (çift giriş invariantı) | Escrow suistimalinin tek matematiksel garantisi |
| K3 | **Supabase test izolasyonu: ortam başına ayrı proje DEĞİL, `pgTAP` + şema-bazlı ephemeral DB + Testcontainers-Postgres+PostGIS** | Maliyet ($25/proje) ve RLS politikalarının gerçek Postgres'te doğrulanması |
| K4 | **Anti-fraud fotoğraf bütünlüğü, "negatif test öncelikli"**: galeri yükleme / sahte GPS / replay denemeleri MUTLAKA bloke testleriyle kanıtlanır | Güven omurgası = ürünün rekabet farkı; kırılırsa tüm değer önerisi çöker |
| K5 | **Go/No-Go kapısı: 9 blokör kriterden HİÇBİRİ kırmızı olamaz** (§9). Para, KVKK özel nitelikli veri ve fotoğraf bütünlüğü "sıfır tolerans" | Hukuk devrindeki 3 kapatma-riski (6493 / KVKK / 5684) doğrudan test kapısına bağlandı |
| K6 | **DENETİM SONUCU: 6 çelişki/boşluk tespit edildi** (§7), 2'si pilot öncesi MUTLAKA çözülmeli (BOSLUK-1 KYC retention cron, CELISKI-1 webhook capture modeli) | Loop-1 kapanışı için kritik yol |

---

## 1. Test Stratejisi & Araç Seti

### 1.1 Katman matrisi (stack-spesifik)

| Katman | Kapsam | RN (customer + provider) | Python/FastAPI | Supabase / DB |
|---|---|---|---|---|
| **Birim** | Saf fonksiyon, hesap, reducer, validator | **Jest + React Native Testing Library**; Zustand store testleri | **pytest**; Pydantic model + servis katmanı; `freezegun` (24s timer) | **pgTAP** (trigger, RLS, RULE, constraint) |
| **Entegrasyon** | Servis + DB + PSP mock | api-client ↔ MSW (mock service worker) ile sözleşme testi | **pytest + httpx.AsyncClient** + **Testcontainers (postgres:16 + postgis)** + **respx** (Iyzico HTTP mock) | Migration apply + seed + gerçek trigger/RLS |
| **Sözleşme** | OpenAPI ↔ TS tip senkronu | `openapi-typescript` çıktısı CI'da diff'lenir (drift = build fail) | `schemathesis` ile OpenAPI fuzz | — |
| **E2E** | Uçtan uca akış (gerçek cihaz/emülatör) | **Maestro** (öncelikli; YAML, RN-dostu) veya Detox | E2E ortamına deploy edilmiş gerçek backend | Staging Supabase (Frankfurt) |
| **Manuel / Keşif** | Pilot saha, kamera donanımı, gerçek PSP sandbox | Cihaz matrisi (§1.4) | — | Iyzico sandbox |
| **Yük / Dayanıklılık** | Dispatch, webhook idempotency, partition | — | **Locust** (webhook storm, dispatch sorgusu) | `pgbench` + EXPLAIN ANALYZE |

> **Neden Maestro > Detox:** Maestro'nun in-app kamera ve native izin (kamera/GPS) akışlarında flaky oranı daha düşük; anti-fraud akışını test ederken kritik. Detox yedek.

### 1.2 Supabase'i test ortamında izole etme (KARAR)

3 katmanlı izolasyon — saf "tek staging projesi"ne güvenilmez çünkü RLS ve trigger'lar para güvenliğinin temeli:

1. **DB-katmanı birim/entegrasyon → Testcontainers (postgres:16 + postgis + pgTAP).**
   - `supabase/migrations/*.sql` aynen apply edilir → trigger (`app.check_order_transition`), RULE (foto immutability), constraint'ler gerçek Postgres'te test edilir.
   - `auth.uid()` ve `app_metadata.role` mock'lanır: `SET LOCAL request.jwt.claims = '{"sub":"...","app_metadata":{"role":"customer"}}'` ile RLS politikaları gerçekten çalıştırılarak doğrulanır.
   - Maliyet sıfır, CI'da paralel, her test ephemeral şema.

2. **RLS regresyon paketi → pgTAP (`supabase test db`).**
   - Her kritik tablo için "X rolü Y satırı GÖREMEZ/YAZAMAZ" assertion'ları (§5.3 matrisi → test'e bire bir çevrilir).
   - `money.*` ve `audit.*` şemalarına `authenticated` JWT ile erişimin **0 satır** döndürmesi zorunlu test.

3. **E2E → ayrı `washapp-staging` Supabase projesi (Frankfurt/eu-central-1).**
   - Prod'dan tamamen ayrı, Iyzico sandbox merchant'a bağlı, sentetik veriyle dolu.
   - **PII/üretim verisi staging'e ASLA kopyalanmaz** (KVKK + hukuk devri retention kuralı).

```
# CI test akışı (özet)
1) docker run postgres+postgis        -> migrations apply -> pgTAP RLS/trigger suite
2) Testcontainers + httpx.AsyncClient -> backend entegrasyon (respx ile Iyzico mock)
3) Jest + RNTL + MSW                   -> RN birim + api-client sözleşme
4) Maestro -> washapp-staging          -> E2E happy + escrow + foto akışı (nightly)
```

### 1.3 Test verisi & fixture stratejisi

- **Para testlerinde "altın senaryo" sabitleri** (config'ten, pazarlama devri): AOV 450 TL, komisyon %22 (99 TL), koruma fonu 15 TL, ödeme PSP ~%2.5. Her ledger testi bu sabitlerle hesap doğrular.
- **Persona fixture'ları:** `customer_mert` (Levent SUV), `provider_aktif` (4.2+ puan), `provider_askida` (4.2 altı), `plaza_b2b_filo`.
- **Coğrafi fixture:** Maslak-Levent-Büyükdere pilot poligonu (PostGIS), poligon-içi/dışı koordinat çiftleri (geofence testi için).

### 1.4 Manuel/cihaz test matrisi (pilot öncesi zorunlu)

| Eksen | Minimum kapsam | Neden |
|---|---|---|
| Android | Samsung (One UI), Xiaomi (MIUI agresif izin kısıtı), Pixel | MIUI kamera/arkaplan-konum izinleri anti-fraud'u bozabilir |
| iOS | iPhone 12–15, iOS 16/17 | Kamera frame processor + Keychain |
| Ağ | 4G zayıf sinyal, kapalı otopark (GPS drift!) | Pilot bölge kapalı otoparklı plazalar — **GPS güvenilmezliği kritik uç durum** |
| Donanım | Düşük ışık (kapalı otopark) fotoğraf kalitesi | Kanıt fotoğrafının okunabilirliği = delil değeri (HMK m.193) |

---

## 2. Kritik Akış Kabul Kriterleri (Acceptance)

### 2.1 AKIŞ A — Escrow para akışı (PR-5/6/7)

**Gherkin-stili kabul:**

```gherkin
Senaryo: Mutlu yol — müşteri onayı ile capture
  Diyelim ki sipariş OLUSTURULDU, müşteri 450 TL ödedi (provizyon/auth)
  Ve ledger'da escrow_held +450, customer_auth -450 satırı var
  Diyelim ki sipariş SONRASI_FOTO_OK durumunda
  Eğer müşteri onaylarsa (order_confirmed)
  O zaman Iyzico capture çağrılır (idempotent)
  Ve ledger: provider_payable +331.37, commission +99, koruma_fonu +15, psp_fee +4.63 (≈%2.5*? netleştir)
  Ve TÜM hesapların SUM'ı = 0 (çift giriş invariantı)
  Ve sipariş TAMAMLANDI

Senaryo: 24s otomatik onay (cron)
  Diyelim ki sipariş SONRASI_FOTO_OK ve 24 saat geçti, itiraz yok
  Eğer auto-approve cron çalışırsa (freezegun ile +24h01m)
  O zaman capture tetiklenir, sipariş TAMAMLANDI
  Ve ledger 0'a denkleşir

Senaryo: İtiraz açıldı — capture YAPILMAZ
  Diyelim ki sipariş SONRASI_FOTO_OK ve müşteri dispute_opened
  O zaman capture ASLA tetiklenmez
  Ve para PSP havuzunda bloke kalır (provider_payable oluşmaz)
  Ve sipariş ITIRAZ durumuna geçer
```

| # | Kabul kriteri | Doğrulama |
|---|---|---|
| A-1 | **Ledger invariantı**: her senaryo sonunda `SELECT SUM(amount) FROM money.ledger_entries WHERE order_id=X` = 0 | pgTAP + entegrasyon |
| A-2 | **Çift capture imkânsız**: aynı `psp_event_id` iki kez gelince ikinci işlem no-op | Webhook idempotency testi (§3.2) |
| A-3 | **Provizyon süresi aşımı**: Iyzico auth 7 gün sonra düşerse → telafi akışı (re-auth/iptal), para kaybı yok | respx ile auth-expired mock |
| A-4 | **İtiraz penceresinde capture yasak**: state machine `ITIRAZ` iken capture çağrısı raise eder | trigger + servis testi |
| A-5 | **Komisyon/fon donması**: sipariş anındaki config kopyası kullanılır; sonradan komisyon değişse eski sipariş değişmez | orders satırı snapshot testi |

### 2.2 AKIŞ B — Fotoğraf doğrulama bütünlüğü (PR-2/3/4)

| # | Kabul kriteri | Doğrulama (NEGATİF öncelikli) |
|---|---|---|
| B-1 | **Galeri yüklemesi imkânsız**: yalnızca in-app kamera frame'i kabul; galeri/dosya picker yolu API'de reddedilir | E2E + backend negatif test (manuel upload denemesi → 422) |
| B-2 | **GPS+zaman damgası bağlama**: foto metadata'sı sunucu zamanı ve sipariş konumuyla ±150m / ±5dk içinde tutarlı olmalı, değilse reddet | Sahte/uzak GPS payload → reddedilir |
| B-3 | **İstemci SHA-256 = sunucu re-hash**: hash uyuşmazlığı → reddedilir, append-only kayıt oluşmaz | Bozuk byte payload testi |
| B-4 | **Değişmezlik**: yüklenmiş foto satırına UPDATE/DELETE denemesi → RULE do-instead-nothing + RLS reddi (3'lü savunma) | pgTAP: UPDATE 0 row, DELETE 0 row |
| B-5 | **Öncesi/sonrası tam set**: 4 köşe + jant + iç = N açı; eksik açı ile durum ilerlemesi engellenir | state machine: ONCESI_FOTO_OK ancak tam set ile |
| B-6 | **Signed URL süresi**: foto erişimi 60sn imzalı URL; kalıcı public URL üretilemez | Storage politikası testi |

### 2.3 AKIŞ C — Eşleştirme/dispatch (PR-11/14)

| # | Kabul kriteri | Doğrulama |
|---|---|---|
| C-1 | **Geofence**: pilot poligonu DIŞINDA sipariş oluşturulamaz (PR-14) | poligon-dışı koordinat → 422 |
| C-2 | **En yakın N müsait**: `ST_DWithin` + KNN sıralaması doğru; demirlenmiş (plaza) hizmet veren önceliklenir | PostGIS sorgu testi + sıralama assertion |
| C-3 | **Yarı-manuel override**: dispatcher öneriyi değiştirebilir; hizmet veren **kabul/ret edebilir (gerçek ret yolu olmalı)** | hukuk devri SGK karinesi → ret akışı testi (zorunlu) |
| C-4 | **Hayalet sipariş koruması**: hizmet veren VARDI işaretlerken GPS konumu ≠ sipariş konumu → uyarı/blok | §6 dolandırıcılık |

---

## 3. En Riskli Senaryolar & Dolandırıcılık Vektörleri

> Bunlar "test edilmezse pilot batar" senaryoları. Her biri için saldırgan-zihniyetli negatif test.

| ID | Vektör | Saldırı senaryosu | Savunma testi | Sahip |
|---|---|---|---|---|
| **FR-1** | **Sahte fotoğraf** | Hizmet veren önceden çekilmiş/başka aracın fotoğrafını yükler | B-1..B-4: galeri bloke + GPS/zaman bağ + hash; ek: aynı hash iki farklı siparişte → flag | Backend |
| **FR-2** | **Çift hasar iddiası** | Müşteri aynı hasar için hem itiraz hem koruma fonu hem kart chargeback | Tek sipariş = tek aktif itiraz constraint; chargeback ↔ dispute mutabakat raporu | Veri+Finans |
| **FR-3** | **Escrow suistimali / erken capture** | Hizmet veren işi yapmadan capture tetiklemeye çalışır | A-4: capture yalnızca SONRASI_FOTO_OK + (onay\|24s); state machine trigger zorlar | Backend |
| **FR-4** | **Hayalet sipariş** | Hizmet veren + sahte müşteri hesabı uydurma sipariş → komisyon/teşvik farming | C-4 GPS bağ + cihaz parmak izi + ödeme gerçekliği (provizyon başarısız = sipariş yok) + hız/frekans anomali kuralı | Veri |
| **FR-5** | **Puan manipülasyonu** | Hizmet veren sahte 5★ ağı; veya rakip 1★ bombardımanı (4.2 askıya düşürme silahı) | Yalnızca TAMAMLANMIŞ siparişten puan; tek müşteri-hizmet veren çifti N gün içinde tek oy; anomali tespiti; askı kararı insan onayı | Veri+Ops |
| **FR-6** | **Sahte GPS / mock location** | Hizmet veren VARDI'yı uzaktan tetikler (mock GPS app) | Play Integrity (MVP log-only → flag), GPS+ağ konumu çapraz kontrol, kapalı otopark drift toleransı ile birlikte anomali skoru | Mobil |
| **FR-7** | **RLS açığı / yetki yükseltme** | Müşteri JWT'siyle `money.*` okuma, başka müşterinin siparişi, role claim manipülasyonu | §4 RLS suite: cross-tenant 0 satır; role yalnızca service_role yazar; money/audit mobile tamamen kapalı | Güvenlik |
| **FR-8** | **Webhook sahteciliği / replay** | Sahte Iyzico webhook ile capture/iade tetikleme | HMAC imza doğrulama + unique(psp,psp_event_id); imzasız/replay → reddedilir | Backend |
| **FR-9** | **Abonelik suistimali** | Aylık 2 yıkamalık abonelikle sınırsız çağrı | Kullanım sayacı + dönem reset; kota aşımı tek yıkama ücretine düşer | Veri |
| **FR-10** | **İade/cayma kötüye kullanımı** | Müşteri hizmet bitince "ifaya başlamayı onaylamadım" der | Cayma onay kutusu timestamp+IP loglu; tamamlanan hizmette cayma kalkar (hukuk devri) | Backend+Hukuk |

### 3.1 Uç durumlar (edge cases) — özel test listesi

- **Kapalı otopark GPS drift**: B-2 toleransı kapalı alanda esnetilmeli ama suistimale açık olmamalı → "varış doğrulama" için GPS + manuel dispatcher teyidi hibrit (test: drift senaryosu kabul edilmeli, ışınlanma reddedilmeli).
- **Yarım kalan iş**: hizmet veren ONCESI_FOTO_OK sonrası kaybolur → sipariş iptali + tam iade + provider penaltı; ledger 0.
- **Eşzamanlı capture + dispute**: müşteri tam 24. saatte hem onay hem itiraz → state machine tek geçiş garantisi (race condition testi, `SELECT FOR UPDATE`).
- **PSP timeout/yarı-capture**: Iyzico capture isteği timeout ama gerçekte gerçekleşti → idempotent retry, çift capture yok (A-2).
- **Saat dilimi / 24s sınırı**: cron tam sınırda; DST/UTC tutarlılığı (freezegun UTC).
- **Provider aynı anda 2 siparişe atanır**: dispatch concurrency → tek atama lock.

---

## 4. Güvenlik & KVKK Test Maddeleri

### 4.1 Güvenlik test paketi

| ID | Test | Beklenen |
|---|---|---|
| SEC-1 | `authenticated` JWT ile `money.*`/`audit.*` SELECT | 0 satır (RLS politikası yok = kilitli) |
| SEC-2 | Müşteri A, müşteri B'nin order/foto/ledger'ına erişim | 403/0 satır (cross-tenant izolasyon) |
| SEC-3 | Mobil app'ten role claim yükseltme denemesi | Reddedilir; role yalnızca FastAPI service_role app_metadata'ya yazar |
| SEC-4 | Webhook HMAC olmadan/yanlış imza | Reddedilir (FR-8) |
| SEC-5 | Storage foto bucket'a anonim/authenticated direkt erişim | private bucket, yalnızca 60sn signed URL |
| SEC-6 | SQL injection (Pydantic + parametreli sorgu) | schemathesis fuzz temiz |
| SEC-7 | JWT süre/iptal; oturum yenileme | Geçersiz token reddi |
| SEC-8 | Kart verisi (PAN/CVV) backend loglarında/DB'de | Hiç bulunmamalı (Iyzico hosted 3DS, PCI kapsam dışı) |
| SEC-9 | Rate limit (login, sipariş, webhook) | Brute-force/DDoS koruması aktif |

### 4.2 KVKK test paketi (hukuk devrine bağlı — sıfır tolerans)

| ID | Test | Beklenen |
|---|---|---|
| KVKK-1 | **Adli sicil/kimlik belgesi "doğrula-ve-at"**: yüklemeden ≤7 gün sonra retention cron çalışır → belge SİLİNMİŞ, yalnızca `adli_sicil_dogrulandi(bool)+tarih+operator_id` kalır | evidence-kyc bucket bazlı retention cron testi (BOSLUK-1 kapanış kanıtı) |
| KVKK-2 | **Region**: Supabase + Render Frankfurt (eu-central-1) | Config/infra testi |
| KVKK-3 | **Katmanlı rıza**: 3 ayrı kutu (sözleşme/adli sicil/İYS); `kvkk_onay_ts`'ye tip+versiyon+IP+timestamp yazılır | Onay payload testi (tek kutu DEĞİL) |
| KVKK-4 | **Veri konusu hakları**: erişim/silme talebi akışı; silmede ledger/audit yasal saklama ile çelişki çözümü (anonimleştirme) | Endpoint testi |
| KVKK-5 | **Foto delil saklama vs KVKK silme**: HMK m.193 delil sözleşmesi gereği foto saklanır ama erişim minimuma iner | Politika testi |
| KVKK-6 | **Veri ihlali 72s prosedürü** | Runbook + alarm testi (manuel tatbikat) |
| KVKK-7 | **Üretim PII staging'e kopyalanmaz** | CI guard: staging seed yalnızca sentetik |

---

## 5. Kalite Metrikleri & CI Kapıları

| Metrik | Eşik (pilot öncesi) | Araç |
|---|---|---|
| **Kritik yol kapsama** (para, durum makinesi, foto, RLS, webhook) | **≥ 90% branch** | pytest-cov, jest --coverage |
| Genel backend kapsama | ≥ 75% | pytest-cov |
| RN kritik ekran/store kapsama | ≥ 70% | jest |
| RLS regresyon assertion sayısı | §5.3 matrisindeki HER hücre için ≥1 test | pgTAP |
| Ledger invariant test geçişi | **%100 (sıfır tolerans)** | entegrasyon |
| E2E mutlu+dolandırıcılık senaryoları | ≥ 12 senaryo yeşil (§2, §3) | Maestro nightly |
| Flaky test oranı | < %2 | CI retry istatistiği |
| Webhook idempotency yük testi | 1000 eşzamanlı dup event → 1 işlem | Locust |
| Performans: en yakın hizmet veren sorgusu | p95 < 200ms (Yıl-1 hacmi) | pgbench/EXPLAIN |
| Sözleşme drift (OpenAPI↔TS) | 0 (drift = build fail) | openapi-typescript diff |

**CI bloke kuralı:** kritik yol kapsama < %90 VEYA herhangi bir ledger-invariant/RLS/foto-immutability testi kırmızı → **merge bloke**.

---

## 6. ÇELİŞKİ & BOŞLUK DENETİMİ (4 devir çapraz analizi)

> En değerli bölüm: önceki ajanların birbirini tam örtmediği noktalar. Her bulgu için: kanıt → etki → karar.

| ID | Tip | Bulgu | Etki | KARAR / Aksiyon | Önem |
|---|---|---|---|---|---|
| **BOSLUK-1** | Veri ↔ Hukuk | Veri mimarisi `evidence-kyc` bucket'ı tanımladı ama **KALICI** sayıyordu; hukuk devri "doğrula-ve-at ≤7 gün" zorunluluğu getirdi. KYC için **gün-bazlı retention cron veri dokümanında YOK** | KVKK özel nitelikli veri = KAPATMA riski | Veri/yazılım: evidence-kyc için ayrı **günlük retention cron** (5. cron'a ek 6.); test KVKK-1 bunu kanıtlar. **Pilot öncesi zorunlu.** | 🔴 P0 |
| **CELISKI-1** | Yazılım ↔ Hukuk | Yazılım "provizyon-then-capture **taklidi**" dedi (gerçek auth-capture değil, gün-0 auth + gecikmeli capture). Hukuk "Iyzico provizyon+split capture **yeterli, açık soru kapandı**" dedi ama **Iyzico'nun 7+ günlük provizyon tutma + kısmi capture'ı teknik destekleyip desteklemediği DOĞRULANMADI** | 24s+ escrow modeli teknik olarak çökerse tüm para akışı yeniden tasarlanır | **Iyzico sandbox'ta PoC testi (A-3): auth→7 gün→capture gerçekten çalışıyor mu?** Çalışmıyorsa "platform havuzu" yasak (6493), alternatif: kısa provizyon + hızlandırılmış onay penceresi. **Loop-2 ilk iş.** | 🔴 P0 |
| **CELISKI-2** | Pazarlama ↔ Hukuk | Pazarlama "günde min 3 iş garantisi" (arz teşviki) dedi; hukuk bunu **SGK işçi-sayılma karinesi** olarak işaretledi → "reddetme hakkı saklı" akışa çevrildi | Geriye dönük SGK prim/kıdem riski | Ürün akışında **gerçek ret yolu** (C-3) zorunlu; "garanti" dili kaldırılır. Test C-3 ret yolunu doğrular. Pazarlama dokümanı §ilgili bölüm güncellensin | 🟠 P1 |
| **BOSLUK-2** | Pazarlama/Veri ↔ Test | NSM = "itirazsız tamamlanan yıkama" tanımlı ama **itiraz oranı guardrail eşiği sayısal değil**; ne kadar itiraz "sağlıksız"? | Go/No-Go kararı ölçülemez | KARAR: **itiraz oranı > %5 = sarı, > %10 = kırmızı (no-go)**; varış süresi p50 hedefi pilot bölgede < 25dk. §9'a eklendi | 🟠 P1 |
| **BOSLUK-3** | Veri ↔ Finans | Ledger satır dağılımı (komisyon 99 / fon 15 / psp fee) **net toplam = 450'yi tam kapatmıyor**; provider_payable kalemi PSP fee'yi kimin yüklendiğine göre belirsiz (provider mı platform mı?) | Birim ekonomi ve payout yanlış hesaplanır | KARAR: PSP fee'yi **platform yüklenir** (komisyondan düşülür), provider net = 450 - 99(kom) - 15(fon) = **336 TL**; A-1 testi bu sabitlerle. Finans ajanı teyit etsin | 🟠 P1 |
| **BOSLUK-4** | Yazılım ↔ Test | Play Integrity "MVP log-only" → mock-GPS (FR-6) pilotta **aktif engellenmiyor**, yalnızca loglanıyor | Sahte varış/hayalet sipariş riski pilotta açık | KARAR kabul edilebilir AMA: log-only + **dispatcher manuel varış teyidi** hibrit zorunlu (kapalı otopark zaten manuel teyit gerektiriyor); flag'lenen işlemler insan incelemesine. Faz-2 hard-block | 🟡 P2 |

**Özet:** P0 (2 adet) pilot öncesi mutlak çözülmeli. P1 (3) pilot esnasında izlenir/düzeltilir. P2 (1) Faz-2.

---

## 7. Go / No-Go Kapısı

> Pilot lansmanı için 9 kapı. **HİÇBİRİ kırmızı olamaz.** Sarı kapı → koşullu go + izleme planı.

| # | Kapı | Yeşil eşik | Kırmızı (NO-GO) |
|---|---|---|---|
| G1 | **Para bütünlüğü** | Tüm ledger-invariant + idempotency testleri %100 yeşil; Iyzico sandbox PoC (CELISKI-1) çalışıyor | Herhangi biri kırmızı |
| G2 | **Escrow yasal modeli** | Para PSP havuzunda; platform hesabına hiç girmiyor (6493) | Para platform hesabına giriyor |
| G3 | **Fotoğraf bütünlüğü** | B-1..B-6 + FR-1 yeşil; galeri/sahte GPS/replay bloke kanıtlı | Sahte foto enjekte edilebiliyor |
| G4 | **KVKK özel nitelikli veri** | KVKK-1 (doğrula-ve-at cron) + KVKK-2 (Frankfurt) + KVKK-3 (katmanlı rıza) yeşil | Adli sicil kalıcı saklanıyor / EU dışı |
| G5 | **RLS / yetki izolasyonu** | SEC-1..SEC-3 + FR-7 yeşil; money/audit mobile 0 satır | Cross-tenant/şema sızıntısı |
| G6 | **Garanti fonu yapısı** | "Hasar Tazmin Garanti Fonu", tazmin tavanlı, sigorta dili yok (5684) | Prim/risk havuzu gibi işliyor |
| G7 | **Dolandırıcılık savunması** | FR-1..FR-10 senaryoları test edildi, P0/P1 kapatıldı | P0 fraud açığı açık |
| G8 | **Kalite eşikleri** | Kritik yol kapsama ≥%90, flaky <%2, E2E ≥12 yeşil | Kapsama < %90 |
| G9 | **Operasyonel guardrail** | İtiraz oranı simülasyonda < %5, varış p50 < 25dk, manuel dispatcher + 72s ihlal runbook hazır | İtiraz > %10 / runbook yok |

**Koşullu Go formülü:** 0 kırmızı + en fazla 2 sarı (izleme planıyla) → **GO**. Aksi → NO-GO.

---

## 8. LOOP 2 İÇİN ÖNCELİK LİSTESİ (önem sırasıyla)

| Sıra | Açık konu | Neden kritik | Sahip (öneri) |
|---|---|---|---|
| **1** | **Iyzico provizyon/escrow PoC (CELISKI-1)**: sandbox'ta auth→7gün→split capture gerçekten çalışıyor mu? Çalışmıyorsa escrow modeli + onay penceresi (24s) yeniden tasarlanır | Tüm para akışının ve 6493 uyumunun temeli; çökerse mimari değişir | Yazılım + Finans + Hukuk |
| **2** | **KYC retention cron (BOSLUK-1)**: evidence-kyc gün-bazlı doğrula-ve-at cron'unun veri/yazılım dokümanına eklenmesi + KVKK-1 testi | KVKK özel nitelikli veri = kapatma + ceza | Veri + Yazılım |
| **3** | **Ledger kalem dağılımı netleştirme (BOSLUK-3)**: PSP fee kim yüklenir, provider net tam tutar, abonelik/B2B'de komisyon mantığı | Birim ekonomi, payout ve A-1 testi buna bağlı | Finans + Veri |
| **4** | **Dolandırıcılık test otomasyonu**: FR-1..FR-10 senaryolarının çalıştırılabilir negatif test paketine (pgTAP + pytest + Maestro) dönüştürülmesi | Güven omurgası = ürün değeri; manuel kalırsa regresyon riski | Test/QA |
| **5** | **SGK ret-yolu ürün akışı (CELISKI-2)**: dispatcher öneri → hizmet veren gerçek kabul/ret UI + telemetri; "garanti" dilinin tüm dokümanlardan temizlenmesi | İşçi-sayılma riski; ret yolu sahteyse risk gerçekleşir | Ürün + Yazılım + Hukuk |
| **6** | **Operasyonel guardrail eşikleri (BOSLUK-2)**: itiraz oranı/varış süresi gerçek pilot telemetri tanımları + dashboard + alarm | Go/No-Go ölçülemezse kapı çalışmaz | Veri + Ops |
| **7** | **Kapalı otopark GPS güvenilirlik stratejisi**: drift toleransı vs mock-GPS suistimali dengesi; hibrit varış doğrulama (GPS + dispatcher teyit) tasarımı + FR-6 testi | Pilot bölge fiziği anti-fraud'u zorluyor; hatalı tolerans güveni kırar | Mobil + Ops + Test |

---

## 9. Ekler

### 9.1 Test komut hızlı referansı (öngörülen)
```
# Backend birim + entegrasyon
pytest -m "unit"           # hızlı, mock'lu
pytest -m "integration"    # Testcontainers (postgres+postgis) + respx
pytest -m "ledger" -q      # para invariant paketi (sıfır tolerans)

# DB / RLS / trigger
supabase test db           # pgTAP suite (RLS matrisi + foto immutability)

# RN
pnpm test                  # jest + RNTL + MSW
pnpm e2e:staging           # Maestro -> washapp-staging (nightly)

# Sözleşme & güvenlik
schemathesis run openapi.json
locust -f load/webhook_storm.py
```

### 9.2 Kapsam politikası dosyaları (öneri)
- `pyproject.toml` → `[tool.coverage]` kritik modüller için `fail_under = 90`
- `jest.config.js` → `coverageThreshold` kritik dizinler
- CI: `ledger`, `rls`, `photo-immutability` etiketli testler ayrı zorunlu job

---

*Bu belge iç kalite çerçevesidir; tüm yasal tutar/yapı kararları (escrow modeli, tazmin tavanı, retention süreleri) hukuk bürosu yazılı görüşüyle kesinleşmeli (bkz. 04-hukuk-risk.md §11). Iyzico escrow PoC sonucu Loop-2'de bu belgenin §6 CELISKI-1 ve §7 G1/G2 kapılarını günceller.*
