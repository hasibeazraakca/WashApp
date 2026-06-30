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
