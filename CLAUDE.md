# WashApp — Proje Hafızası (CLAUDE.md)

> Bu dosya her oturumda otomatik yüklenir. Yeni bir Claude oturumu açıldığında "nerede kaldık"ı buradan öğren. Derinlik için `docs/` klasörünü oku — özellikle `docs/00-MASTER-PLAN.md`.

## Ne yapıyoruz
**WashApp** = kapıda mobil oto yıkama **marketplace**'i (Uber/Yemeksepeti modeli). Araç sahibini (müşteri) seyyar yıkamacıyla (hizmet veren) buluşturur. Rekabet farkı **"3 Kalkan" güven omurgası**:
- **A) Fotoğraf kanıtı:** sadece uygulama-içi kamerayla GPS+zaman damgalı, SHA-256 imzalı, değiştirilemez öncesi/sonrası fotoğraf.
- **B) Escrow:** müşteri onayı veya 24s otomatik onaya kadar para bloke (PSP havuzunda).
- **C) Hasar Tazmin Garanti Fonu:** işlem başı 15 TL ("sigorta" değil — sözleşmesel garanti).

Gelir: %22 komisyon + abonelik (790/1490 TL) + B2B filo. Pilot: İstanbul Maslak–Levent–Büyükdere koridoru.

## Sabit teknik stack (DEĞİŞTİRME)
- **Mobil:** React Native, Expo prebuild, monorepo — 2 app: `apps/customer` + `apps/provider`
- **Backend:** Python / FastAPI, Render.com (Frankfurt), `backend/`
- **DB/Auth/Storage:** Supabase (Postgres + PostGIS + Auth + Storage + RLS), **Frankfurt/eu-central-1** (KVKK zorunluluğu)
- **Ödeme:** Iyzico Pazaryeri / Alt Üye İşyeri (escrow). **Para hiçbir zaman WashApp hesabına girmez** (6493 lisans tuzağı).

## 3 kritik hukuki karar (mimariyi belirledi)
1. **6493:** Para WashApp'a girmez → Iyzico submerchant + split payment. Her yıkamacı PSP'de alt üye işyeri.
2. **KVKK:** Supabase Frankfurt + adli sicil "doğrula-ve-at" (belge ≤7 gün sonra silinir, DB'ye sadece boolean).
3. **5684 + SGK:** Fon "garanti" (sigorta değil); yıkamacı = bağımsız yüklenici (gerçek ret hakkı zorunlu).

## Mevcut durum (2026-06-30)
- ✅ **Planlar** (`docs/00..05`) ve **F0 kod iskelesi** tamam.
- ✅ **GitHub:** https://github.com/hasibeazraakca/WashApp (main). git identity: `hasibeazraakca <hasibeazraakca@gmail.com>` (bu repoda local).
- ✅ **Supabase Frankfurt teyit edildi:** ref `perrspvhpqwedrhfduiz`. Pooler host **`aws-1-eu-central-1`** (aws-0 DEĞİL!), port 6543.
- ✅ **Migration uygulandı:** 4 şema + 26 tablo + PostGIS + durum makinesi trigger + append-only RULE + 3 Storage bucket canlı. (`python -m app.cli migrate`)
- ✅ **F1 KODLANDI ve CANLI TEST EDİLDİ (parasız uçtan uca):** `/me`, sipariş oluştur (geofence+fiyat snapshot), durum makinesi (assign→arrive→start-wash→confirm), dispatch KNN, **foto kanıt (12 foto Storage'a yüklendi + sunucu re-hash 409 doğrulandı)**. Negatif: geofence 403, hash-tamper 409 ✓.
- ✅ **Eklendi:** `app/cli.py` (migrate + export-openapi), HS256 JWT fallback, config `asyncpg_dsn` normalizasyonu, paket fiyat tablosu.
- ✅ **Bug fix:** `requirements.txt` httpx 0.28.1→0.27.2 (supabase çakışması; Render build'i kırıyordu).
- ⏳ **Render deploy:** kullanıcı uğraşıyor. Env'de `DATABASE_URL` (aws-1 + şifre), `SUPABASE_URL/SERVICE_ROLE_KEY/JWT_SECRET` set edilmeli.
- ⚠️ **Sırlar bu oturumda chat'e girdi** (DB şifresi `washap.0408`, service_role, JWT secret) → kullanıcı pilot öncesi rotate etmeli.

## F1.5 — Katalog + Kampanyalar + Onboarding (2026-07-01, CANLI TEST EDİLDİ)
- ✅ **Kampanyalar** (`0003`): `app.kampanyalar` + `kampanya_tiklama` (sayaç). Router `campaigns.py` (list/click/admin-create). Ana ekranda karusel. Tıklama sayacı E2E ✓.
- ✅ **Hizmet katalogu** (`0004`): `hizmet_kategorileri`+`hizmetler` (5 kat/11 hizmet, placeholder fiyat) + `hizmet_talepleri` + `orders.hizmet_id`. **Esnek akış:** `foto_kanit_gerekli`/`randevu_modu` bayrakları. Yıkama+iç detay → orders (foto+escrow, `hizmet_id`'den fiyat); yağ/lastik/bakım → `POST /services/requests` (fotosuz randevu). `services.py`. Mobil: `ServicesScreen`→`NewOrder`/`ServiceRequest`. E2E ✓ (order gmv=450, talep tahmini=1500, red 400).
- ✅ **Onboarding + kayıt** (Play Store): LoginScreen'e **Kayıt Ol** (signUp); `AppGate` profil eksikse (ad-soyad/GSM/kvkk) **zorunlu `OnboardingScreen`**. Konum (expo-location, ZORUNLU) + bildirim (expo-notifications) izinleri + KVKK metni (konum/bildirim rızası dahil, `lib/consent.ts`). OneSignal İLERİDE (Expo Go push yok → EAS build). app.json: plugin+permission eklendi.
- 🔴 **KRİTİK GOTCHA ÇÖZÜLDÜ** (`0005`+`0006`): PostgREST'te `app` şeması **expose değildi** (sadece public/graphql_public) → tüm `.schema("app")` okumaları PGRST106; expose sonrası app tablolarında **authenticated GRANT yoktu** → 42501; ayrıca RLS politikaları başka tablolara subquery yaptığından (orders→b2b_uyelikler, araclar→orders) referans tablolara da SELECT grant şart. `alter role authenticator set pgrst.db_schemas` + grant'lar. **Mobilde veri gelmemesinin kök nedeni buydu.** Kullanıcı Dashboard>Settings>API>Exposed schemas'a da `app` eklemeli (kalıcılık).
- ⚠️ Backend kod değişiklikleri (campaigns/services router, orders.hizmet_id) **Render'a deploy edilmeli**; mobil şu an yerel backend'e (`192.168.1.102:8000`) bakıyor. Katalog/kampanya LİSTELERİ Supabase'den okunur (backend gerekmez); ama POST'lar (order/talep/onboarding updateMe) backend'e erişim ister.

## F1.6 — Provider (hizmet veren) iş akışı (2026-07-01, CANLI TEST EDİLDİ)
- ✅ **Backend** (`0007`): `hizmet_talepleri` +`hizmet_veren_id`+`fiyat_teklifi`; `talep_medya` (serbest ilerleme fotosu). Endpoint'ler — talep: `GET requests/open|mine|{id}`, `POST {id}/claim|quote|status|media(/upload-url)`. Sipariş self-servis: `GET orders/open|mine`, `POST orders/{id}/claim` (olusturuldu→eslestirildi, dispatch_mode='self'). Durum akışı yeni→uslenildi→teklif_verildi→planlandi→yolda→tamamlandi|iptal (backend zorlar; geri geçiş 409). **E2E ✓** (üstlen, çift-claim 409, fiyat, durum ilerlet/geri-red, sipariş claim→arrive, medya yol-doğrulama 400, yabancı 403).
- ✅ **Provider app** (`apps/provider`, önce boş iskeletti): theme/supabase/api/auth müşteriden uyarlandı. Ekranlar: Login, **JobsScreen** (müsait toggle + Açık işler/Aktif işlerim: sipariş+talep), **RequestJobScreen** (üstlen/fiyat/durum/foto), **OrderJobScreen** (üstlen→vardım→6 açı öncesi foto→başlat→6 sonrası foto). Foto: `expo-image-picker`(in-app kamera)+`expo-crypto`(byte SHA-256)+`expo-file-system/legacy uploadAsync`(imzalı URL'e PUT)+`expo-location`(GPS). Kanıt yükleme kontratı F1 seed'iyle aynı (PUT ham byte + content-type). typecheck temiz.
- ⚠️ Provider app AYRI Expo binary → ayrı `expo start`/QR. Evidence foto upload'ı provider GPS'i **plaza geofence içinde** olmasını ister (backend 403). Provider `.env` = müşteriyle aynı (yerel backend).

## SIRADAKİ İŞ — Reklam/kampanya self-servis (provider) — KARARLAR ALINDI
Bkz. [[reklam-kampanya-kararlari]] hafızası. Özet: **ödeme=placeholder manuel 'ödendi'** (gerçek Iyzico F2'de), **sıralama=bütçe+süre satın alma** (teklife göre sıra, süre bitince otomatik kalkar/top-up), **geo-hedefleme=il bazlı**. Kapsam: provider kampanya oluştur → moderasyon/onay (biz inceleriz) → yayın; bütçe/süre; otomatik kaldırma; "kaç kişi geldi" analitik (kampanya_tiklama zaten var). `app.kampanyalar`'a moderasyon durumu + il hedefi + bütçe/teklif/bitiş + admin onay alanları eklenecek.

## SIRADAKİ İŞ — F2 (PARA / ESCROW)
1. **Iyzico Pazaryeri** alt-üye işyeri + split payment entegrasyonu (`payments.py`, `webhooks.py` stub'larını doldur).
2. **confirm → CAPTURE + ledger çift giriş** (komisyon 99 + koruma_fonu 15 + payout 351). Şu an confirm parasız sadece durumu `tamamlandi` yapıyor.
3. **escrow provizyon** sipariş oluşturmada (orders create'e escrow ekle), **24s otomatik onay** worker'ı (`worker.py` escrow_auto_confirm).
4. **payout batch** + **dispute resolve** ledger (tazminat/rücu).
- Yerel test: `backend/.venv`, `uvicorn app.main:app`, seed+E2E betiği scratchpad'de. `.env` hazır (gitignored).

## Çalışma kuralları
- **Fiyat sabitleri tek kaynak:** `packages/config` + `backend` (komisyon 0.22, fon 15 TL, abonelik 790/1490, AOV 450). Çoğaltma.
- **Altın kural:** okuma → Supabase RLS; **yazma + para + durum + iş kuralı → her zaman FastAPI** (service_role). Mobil app `money.*`/`audit.*` şemalarına asla dokunmaz.
- **Sırlar repoda ASLA** (`.env` gitignored). Secrets sadece `backend/.env` (lokal) + Render env grupları.
- **GitHub:** `hasibeazraakca/WashApp`'e push serbest (kullanıcı onayladı). **Render'a canlı deploy / gerçek Iyzico-para / dış servis = önce kullanıcıya sor.**
- Hedef: gözle görülür demo değil, **servis ile çalışan uygulama.**
