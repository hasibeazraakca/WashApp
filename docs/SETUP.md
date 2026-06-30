# WashApp — Yerel Kurulum (SETUP)

> **Belge No:** SETUP · **Kapsam:** Sıfırdan yerel geliştirme ortamı.
> Referans: `00-MASTER-PLAN.md` (§6 ilk adımlar), `03-yazilim-mimarisi.md` (§8 ortamlar).

> ## 🔴 KVKK / BLOKÖR-2 — Region uyarısı (en kritik karar)
> Supabase projesi **MUTLAKA `Frankfurt (eu-central-1)`** region'da açılır.
> Render servisleri **MUTLAKA `frankfurt`** region'da çalışır.
> US (veya AB dışı) region = özel nitelikli verinin usulsüz yurt dışı aktarımı =
> **faaliyet durdurma + ceza riski.** Bu pazarlık konusu değildir.
> Adli sicil/kimlik belgeleri Supabase'e **kalıcı yüklenmez** ("doğrula-ve-at", ≤7 gün).

---

## 0. Önkoşullar

| Araç | Sürüm | Not |
|---|---|---|
| Node.js | 20 LTS | RN/Expo |
| pnpm | 9+ | `corepack enable && corepack prepare pnpm@9 --activate` |
| Python | 3.12 | backend |
| Docker Desktop | güncel | Supabase local stack |
| Supabase CLI | latest | `npm i -g supabase` veya scoop/brew |
| Git | güncel | — |
| (mobil) Xcode / Android Studio | — | EAS dev-client çalıştırmak için |
| (mobil) EAS CLI | latest | `npm i -g eas-cli` |

---

## 1. Repoyu klonla & monorepo bağımlılıkları

```bash
git clone <repo-url> washapp
cd washapp
pnpm install                 # apps/* + packages/* (pnpm workspaces + Turborepo)
```

> Monorepo iskelesi (`apps/customer`, `apps/provider`, `packages/*`, `backend/`,
> `supabase/`) henüz oluşturulmadıysa F0 görevidir — bkz. `00-MASTER-PLAN §6`.

---

## 2. Supabase projesi (Frankfurt) + local stack

### 2.a Bulut projesi (staging/prod için)
1. <https://supabase.com> → **New Project**.
2. **Region: `Central EU (Frankfurt)` / `eu-central-1`** seç (🔴 zorunlu — §0).
3. DB şifresini güvenli sakla (sonra `DATABASE_URL`'e girer).
4. Settings → Database → **Connection pooling** → **Transaction** modunu kullan:
   - Host: `aws-0-eu-central-1.pooler.supabase.com`
   - **Port: `6543`** (Supavisor transaction pooler — ZORUNLU)
   - Bağlantı string'ine `?statement_cache_size=0` mantığı backend `db.py`'de uygulanır
     (asyncpg + transaction pooler uyumu; prepared statement yok).

### 2.b Local stack (Docker)
```bash
supabase start              # local Postgres + Auth + Storage + Studio
supabase status             # local DATABASE_URL, anon/service_role key'leri yazar
```

### 2.c Migration uygula
```bash
# Şema: 4 şema (app / money / audit / geo) + RLS + trigger + RULE
supabase db reset           # supabase/migrations/0001_init.sql'i sıfırdan uygular
# veya artımlı:
supabase migration up
```
> `money.*` ve `audit.*` şemaları **service_role-kilitli** (RLS açık, politika YOK).
> `0001_init.sql` 02-veri-mimarisi'ndeki tüm `CREATE TABLE` + PostGIS + GIST
> indeksleri + `app.check_order_transition` trigger + `photo_evidence` RULE içerir.

### 2.d Storage bucket'ları
- `evidence` → **private** (fotoğraf kanıtı, 60 sn signed URL, append-only)
- `evidence-kyc` → **private**, **≤7 gün retention** (doğrula-ve-at — KVKK BLOKÖR-2)
- `public-assets` → public

---

## 3. Ortam değişkenlerini doldur (.env)

> Sırlar repoda **asla** durmaz. Local'de `.env` (gitignore'lu), prod'da Render env grupları.

`backend/.env` (örnek — `backend/.env.example`'dan kopyala):
```dotenv
APP_ENV=dev
# Supavisor transaction pooler — port 6543, statement cache kapalı (db.py uygular)
DATABASE_URL=postgresql+asyncpg://postgres.<ref>:<pwd>@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>     # money/audit erişimi
SUPABASE_JWT_SECRET=<jwt_secret>

# Iyzico Pazaryeri / Alt Üye İşyeri (sandbox) — para WashApp'a ASLA girmez
IYZICO_API_KEY=<sandbox_key>
IYZICO_SECRET_KEY=<sandbox_secret>
IYZICO_BASE_URL=https://sandbox-api.iyzipay.com
IYZICO_WEBHOOK_SECRET=<hmac_secret>

# İş sabitleri (plan §6 — değiştirme)
COMMISSION_RATE=0.220
PROTECTION_FUND_FEE_TRY=15.00
SUBSCRIPTION_PRICE_2_TRY=790
SUBSCRIPTION_PRICE_4_TRY=1490
AOV_TRY=450
AUTO_CONFIRM_WINDOW_HOURS=24

SENTRY_DSN=
```

Mobil (`apps/customer/.env`, `apps/provider/.env`):
```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon_key>     # anon — RLS korumalı OKUMA + Auth + Realtime
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000   # FastAPI (yazma/para)
```
> Mobil app **service_role key'i ASLA** taşımaz. Yazma/para/durum yalnız FastAPI'ye gider.

---

## 4. Backend (FastAPI) çalıştır

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Doğrula:
```bash
curl http://localhost:8000/healthz       # {"status":"ok"}
open http://localhost:8000/docs          # OpenAPI / Swagger
```

### Worker (6 cron) — ayrı süreç
```bash
cd backend
python -m app.workers.scheduler
# Görevler: 24s onay (60sn) · NSM refresh (saatlik) · partition (günlük) ·
#           payout batch (04:00) · KVKK retention (03:00) · evidence-kyc retention.
# Hepsi SELECT ... FOR UPDATE SKIP LOCKED — çift işleme yok.
```

---

## 5. Mobil app'ler (Expo prebuild + dev-client) başlat

> Saf Expo Go **çalışmaz** (vision-camera frame processor + native crypto gerekir).
> Custom dev-client şarttır.

```bash
# Müşteri app
cd apps/customer
pnpm expo prebuild              # native ios/android üret (ilk sefer)
eas build --profile development --platform ios   # veya android — dev-client binary
pnpm expo start --dev-client    # Metro; cihaza/simülatöre dev-client ile bağlan

# Hizmet veren app (yeni terminal)
cd apps/provider
pnpm expo start --dev-client
```
> Metro `watchFolders` repo köküne işaret eder (monorepo symlink çözümü).

---

## 6. OpenAPI → TS tip senkronu

```bash
# Backend OpenAPI -> packages/types (sözleşme tek kaynak; drift CI'da yakalanır)
cd backend && python -m app.cli export-openapi > ../openapi.json
cd .. && npx openapi-typescript openapi.json -o packages/types/src/api.gen.ts
git diff --exit-code packages/types/src/api.gen.ts   # boş olmalı
```

---

## 7. Lint / test (CI ile aynı)

```bash
# Backend
cd backend && ruff check app tests && ruff format --check app tests && pytest -q

# Frontend
pnpm -r lint && pnpm -r typecheck

# Supabase şema lint + diff (boş olmalı)
supabase db lint
supabase db diff --schema app,money,audit,geo
```

---

## 8. Yaygın sorunlar

| Belirti | Sebep / Çözüm |
|---|---|
| `prepared statement ... already exists` | Supavisor transaction pooler — `db.py`'de `statement_cache_size=0` ve port **6543** olmalı |
| Mobil app kamera/crypto çöküyor | Expo Go ile açılmış; **dev-client** kullan (§5) |
| `money.*` okunamıyor (mobilden) | Beklenen — service_role kilitli; FastAPI üzerinden özet çek |
| CI `openapi drift` fail | `export-openapi` + `openapi-typescript` çalıştırıp `api.gen.ts` commit'le |
| Supabase US region'da açıldı | 🔴 Projeyi sil, **Frankfurt** ile yeniden aç (§0 — KVKK) |

---

*Belge sonu — SETUP.md. Region (Frankfurt) ve port (6543, statement_cache=0) kuralları sabittir.*
