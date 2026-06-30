# WashApp — Veri Mimarisi & Ölçeklenebilirlik (Supabase / Postgres)

> **Doküman sahibi:** Veri Mimarisi & Ölçeklenebilirlik
> **Durum:** LOOP-1 / İkinci ajan çıktısı — Yazılım & Backend ajanları için referans
> **Tarih:** 2026-06-30
> **Stack (sabit):** React Native (2 app) · FastAPI @ Render.com · Supabase (Postgres + Auth + Storage + PostGIS + RLS) · Iyzico/PayTR escrow
> **Önceki referans:** `docs/01-pazarlama-urun.md` (PR-1..PR-15, event taxonomy §7.3, fiyat sabitleri)

---

## 0. Yönetici Özeti (kararlar)

1. **Tek Postgres, çok şema (multi-schema monolit DB):** `auth` (Supabase yönetir), `app` (domain), `money` (escrow/cüzdan/mutabakat — ayrı şema, sıkı RLS), `audit` (denetim izi/event store), `geo` (referans poligonlar). Mikroservis veritabanı parçalamaya Yıl-3'e kadar **gerek yok**; tek DB + iyi indeks + 2 partition yeter.
2. **Kimlik modeli:** `auth.users` (Supabase Auth) **tek kaynak**. `app.profiles` 1:1 uzantı, `role` enum ile (`musteri`, `hizmet_veren`, `dispatcher`, `plaza_yonetici`, `admin`). JWT `app_metadata.role` claim'i RLS'in temeli.
3. **Sipariş durum makinesi DB'de zorlanır:** `orders.status` enum + `order_status_transitions` audit tablosu + Postgres trigger ile **geçersiz geçiş engellenir** (PR-1). Uygulama katmanına güvenmeyiz.
4. **Para = çift girişli defter (double-entry ledger):** `money.ledger_entries` append-only; escrow bloke/serbest, komisyon, koruma fonu, payout hepsi defter satırı. `money.psp_webhook_events` mutabakat tablosu PSP (Iyzico/PayTR) ile **idempotent** eşleşir.
5. **Fotoğraf kanıtı değişmezliği:** Dosya Supabase Storage `evidence` private bucket'ında; DB'de yalnızca **referans + SHA-256 hash + GPS + sunucu timestamp**. `photo_evidence` satırları **append-only, UPDATE/DELETE RLS ile yasak**. İstemci erişimi 60 sn imzalı URL.
6. **PostGIS coğrafi eşleştirme:** `hizmet_veren_konum` (canlı GPS, `geography(Point)`), `hizmet_bolgeleri` (pilot poligon), `KNN + ST_DWithin` ile "en yakın N müsait" sorgusu < 10 ms. GIST indeks zorunlu.
7. **Ölçek:** Yıl-3 = 500k işlem/yıl ≈ **1.400 işlem/gün** → tek Postgres için **küçük yük**. Asıl hacim `audit.events` (işlem başı ~14 event) ve `photo_evidence` (işlem başı ~12 satır). Bu ikisi **aylık range partition** adayı. Soğuk veri 90 gün sonra ucuz storage'a.

---

## 1. Domain Modeli — Üst Düzey Varlık Haritası

```
auth.users ──1:1── app.profiles ──┬── app.musteri_detay
                                   ├── app.hizmet_veren_detay ──1:N── app.onboarding_belgeleri
                                   └── (role)                  └──1:N── app.hizmet_veren_konum (canlı)

app.musteri_detay ──1:N── app.araclar ──1:N── app.orders
app.b2b_hesaplar  ──1:N── app.b2b_uyelikler ──N:1── app.profiles
app.plazalar (geo) ──1:N── app.orders

app.orders ──┬──1:N── app.order_status_transitions   (durum makinesi izi)
             ├──1:N── app.photo_evidence             (öncesi/sonrası kanıt)
             ├──1:1── money.escrow_holds
             ├──1:N── money.ledger_entries
             ├──0:1── app.disputes ──1:N── app.dispute_evidence
             ├──0:1── app.ratings
             └──0:1── app.koruma_fonu_hareketleri

app.subscriptions ──1:N── app.subscription_usage ──N:1── app.orders
money.wallets (hizmet_veren) ──1:N── money.ledger_entries ──1:N── money.payouts
money.psp_webhook_events  (PSP mutabakat — orders/escrow ile eşleşir)
audit.events  (event taxonomy §7.3 — analitik/NSM kaynağı)
audit.admin_actions  (kim ne zaman ne yaptı — KVKK & operasyon)
```

**Şema ayrımı gerekçesi:** `money.*` ve `audit.*` ayrı şema → RLS politikalarını gruplayıp **`anon`/`authenticated` rollerine bu şemalarda hiçbir doğrudan erişim vermemek** (yalnızca `service_role` / FastAPI), para güvenliğinin tek satırlık garantisi. Müşteri app'i parayı asla doğrudan okumaz; FastAPI üzerinden okur.

---

## 2. Kimlik, Roller ve RLS Stratejisi

### 2.1 Kim neyi görür (RLS matrisi)

| Tablo | musteri | hizmet_veren | dispatcher | plaza_yonetici | admin | anon |
|---|---|---|---|---|---|---|
| `profiles` | kendi | kendi | hepsi (R) | kendi+kiracı | hepsi | — |
| `araclar` | kendi | atandığı siparişin aracı (R) | hepsi (R) | — | hepsi | — |
| `orders` | kendi | kendine atanan | hepsi | kendi plazasındakiler (R) | hepsi | — |
| `photo_evidence` | kendi siparişi (R, imzalı URL) | kendi siparişi (INSERT+R) | hepsi (R) | itiraz halinde (R) | hepsi | — |
| `disputes` | kendi | kendine atanan | hepsi | — | hepsi | — |
| `ratings` | kendi verdiği/aldığı | kendi | hepsi (R) | — | hepsi | — |
| `subscriptions` | kendi | — | hepsi (R) | filo: kendi | hepsi | — |
| `hizmet_veren_konum` | — | kendi (yazar) | hepsi (R) | — | hepsi | — |
| `money.*` | **HİÇBİRİ doğrudan** (FastAPI üzerinden özet) | **HİÇBİRİ doğrudan** | — | — | service_role | — |
| `audit.*` | — | — | R (kısıtlı) | — | service_role | — |

**Karar:** `money` ve `audit` şemaları için **RLS açık + politika YOK** = pratikte kilitli; sadece `service_role` (FastAPI'nin Render env'indeki gizli anahtarı) erişir. Mobil app'ler `anon`/`authenticated` JWT ile **asla** para tablolarına dokunamaz.

### 2.2 Rol claim'i ve yardımcı fonksiyon

```sql
-- JWT'den rolü çek (RLS politikalarında tekrar tekrar kullanılır)
create or replace function app.current_role() returns text
language sql stable as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role'),
    'musteri'
  );
$$;

create or replace function app.is_admin() returns boolean
language sql stable as $$ select app.current_role() = 'admin'; $$;

create or replace function app.is_staff() returns boolean
language sql stable as $$ select app.current_role() in ('dispatcher','admin'); $$;
```

> **Not:** `role` JWT'ye **yalnızca güvenilir backend** (FastAPI service_role) tarafından `app_metadata`'ya yazılır. Kullanıcı kendi rolünü yükseltemez (`user_metadata` değil `app_metadata`).

### 2.3 Örnek RLS politikaları (kritik tablolar)

```sql
-- ORDERS: müşteri sadece kendi siparişini, hizmet veren sadece atananı görür
alter table app.orders enable row level security;

create policy orders_musteri_select on app.orders for select
  using ( musteri_id = auth.uid() );

create policy orders_hizmet_veren_select on app.orders for select
  using ( hizmet_veren_id = auth.uid() );

create policy orders_staff_all on app.orders for all
  using ( app.is_staff() ) with check ( app.is_staff() );

create policy orders_plaza_select on app.orders for select
  using ( app.current_role() = 'plaza_yonetici'
          and plaza_id in (select plaza_id from app.b2b_uyelikler where yonetici_id = auth.uid()) );

-- PHOTO_EVIDENCE: hizmet veren yalnızca INSERT eder, kimse UPDATE/DELETE edemez (immutability)
alter table app.photo_evidence enable row level security;

create policy evidence_insert_provider on app.photo_evidence for insert
  with check ( app.current_role() = 'hizmet_veren'
               and exists (select 1 from app.orders o
                           where o.id = order_id and o.hizmet_veren_id = auth.uid()) );

create policy evidence_select_party on app.photo_evidence for select
  using ( exists (select 1 from app.orders o where o.id = order_id
                  and (o.musteri_id = auth.uid() or o.hizmet_veren_id = auth.uid()))
          or app.is_staff() );

-- UPDATE / DELETE politikası TANIMLANMAZ → RLS altında reddedilir = değişmezlik garantisi
```

---

## 3. Çekirdek Şema — SQL Taslağı

> Tüm tablolar `created_at timestamptz default now()`, PK olarak `uuid default gen_random_uuid()`. Timestamp'ler `timestamptz` (UTC saklanır, TR gösterimde +03 uygulanır).

### 3.1 Profiller ve roller

```sql
create type app.user_role as enum
  ('musteri','hizmet_veren','dispatcher','plaza_yonetici','admin');

create table app.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  role          app.user_role not null default 'musteri',
  ad_soyad      text not null,
  telefon       text unique,            -- E.164: +905xxxxxxxxx
  email         text,
  kvkk_onay_ts  timestamptz,            -- aydınlatma metni onayı
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_profiles_role on app.profiles(role);

-- Hizmet veren KYC/onboarding durumu (PR-9)
create type app.onboarding_durum as enum
  ('basvuru','belge_bekliyor','incelemede','egitim','onayli','reddedildi','askida');

create table app.hizmet_veren_detay (
  profile_id        uuid primary key references app.profiles(id) on delete cascade,
  durum             app.onboarding_durum not null default 'basvuru',
  adli_sicil_ok     boolean not null default false,
  kimlik_ok         boolean not null default false,
  ikametgah_ok      boolean not null default false,
  ekipman_ok        boolean not null default false,   -- foto/video mülakat
  egitim_ok         boolean not null default false,
  ortalama_puan     numeric(3,2),                     -- 4.2 eşik (PR-8)
  toplam_is         int not null default 0,
  iban              text,                              -- payout
  aktif             boolean not null default false,    -- durum=onayli && puan>=4.2
  son_konum_ts      timestamptz
);
create index idx_hv_aktif on app.hizmet_veren_detay(aktif) where aktif = true;

-- Onboarding belgeleri (dosya Storage'da, DB referans + hash)
create table app.onboarding_belgeleri (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references app.profiles(id) on delete cascade,
  belge_tipi    text not null,            -- 'adli_sicil','kimlik','ikametgah','ekipman_video'
  storage_path  text not null,            -- evidence-kyc/{profile_id}/{uuid}.pdf
  sha256        text not null,
  durum         text not null default 'incelemede',  -- incelemede/onay/red
  inceleyen_id  uuid references app.profiles(id),
  created_at    timestamptz not null default now()
);
```

### 3.2 Araçlar

```sql
create table app.araclar (
  id            uuid primary key default gen_random_uuid(),
  musteri_id    uuid not null references app.profiles(id) on delete cascade,
  plaka         text not null,
  marka         text, model text, renk text,
  arac_tipi     text not null default 'sedan',  -- sedan/suv/hatchback (SUV +%15)
  created_at    timestamptz not null default now(),
  unique (musteri_id, plaka)
);
create index idx_araclar_musteri on app.araclar(musteri_id);
```

### 3.3 Plazalar & hizmet bölgeleri (PostGIS — PR-14 geofence)

```sql
create extension if not exists postgis;

-- Pilot mikro-bölge poligonu (Maslak-Levent-4.Levent) + plazalar
create table app.hizmet_bolgeleri (
  id          uuid primary key default gen_random_uuid(),
  ad          text not null,                 -- 'Pilot: Buyukdere Ekseni'
  alan        geography(Polygon,4326) not null,
  aktif       boolean not null default true
);
create index idx_bolge_alan on app.hizmet_bolgeleri using gist(alan);

create table app.plazalar (
  id          uuid primary key default gen_random_uuid(),
  ad          text not null,                 -- 'Sapphire','Kanyon','Metrocity'...
  konum       geography(Point,4326) not null,
  bolge_id    uuid references app.hizmet_bolgeleri(id),
  b2b_hesap_id uuid,                          -- gelir paylaşımı (PR-13)
  gelir_pay_orani numeric(4,3) default 0.060, -- %5-8
  created_at  timestamptz not null default now()
);
create index idx_plaza_konum on app.plazalar using gist(konum);

-- Hizmet verenin canlı konumu (eşleştirme için sık güncellenir)
create table app.hizmet_veren_konum (
  hizmet_veren_id uuid primary key references app.profiles(id) on delete cascade,
  konum           geography(Point,4326) not null,
  musait          boolean not null default false,
  demir_plaza_id  uuid references app.plazalar(id),  -- "demirleme"/lokasyon kilidi (PR-11)
  guncellendi     timestamptz not null default now()
);
create index idx_hv_konum_gist on app.hizmet_veren_konum using gist(konum);
create index idx_hv_musait on app.hizmet_veren_konum(musait) where musait = true;
```

### 3.4 Siparişler & durum makinesi (PR-1)

```sql
create type app.order_status as enum (
  'olusturuldu','eslestirildi','varildi','oncesi_foto_ok',
  'yikama','sonrasi_foto_ok','musteri_onay','tamamlandi','itiraz','iptal'
);

create table app.orders (
  id                uuid primary key default gen_random_uuid(),
  musteri_id        uuid not null references app.profiles(id),
  hizmet_veren_id   uuid references app.profiles(id),
  arac_id           uuid not null references app.araclar(id),
  plaza_id          uuid references app.plazalar(id),
  kat_park_no       text,                          -- 'B2 - 142'
  paket             text not null,                 -- 'dis_hizli','standart','premium'
  arac_tipi         text not null default 'sedan',
  -- Para anlık görüntüsü (config'ten kopyalanır, sonradan değişmez)
  gmv               numeric(10,2) not null,        -- 450.00
  komisyon_orani    numeric(4,3) not null default 0.220,
  koruma_fonu       numeric(10,2) not null default 15.00,
  hizmet_veren_eline numeric(10,2),                -- gmv - komisyon
  -- Durum makinesi
  status            app.order_status not null default 'olusturuldu',
  dispatch_mode     text,                          -- 'auto'/'manual'
  onay_penceresi_bitis timestamptz,                -- sonrasi_foto_ok + 24s (PR-5)
  konum             geography(Point,4326),         -- sipariş GPS (geofence)
  subscription_id   uuid,                          -- abonelikten düşüldüyse
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_orders_musteri on app.orders(musteri_id, created_at desc);
create index idx_orders_hv on app.orders(hizmet_veren_id, created_at desc);
create index idx_orders_status on app.orders(status) where status not in ('tamamlandi','iptal');
create index idx_orders_plaza on app.orders(plaza_id, created_at desc);
create index idx_orders_onay_penceresi on app.orders(onay_penceresi_bitis)
  where status = 'musteri_onay';   -- 24s otomatik onay cron'u bu indeksi tarar

-- Durum geçiş izi (her geçiş audit edilir)
create table app.order_status_transitions (
  id            bigint generated always as identity primary key,
  order_id      uuid not null references app.orders(id),
  eski_status   app.order_status,
  yeni_status   app.order_status not null,
  tetikleyen_id uuid references app.profiles(id),   -- kim/sistem
  sebep         text,
  created_at    timestamptz not null default now()
);
create index idx_transitions_order on app.order_status_transitions(order_id, created_at);
```

**Durum makinesi DB-zorlamalı trigger (geçersiz geçişi reddet):**

```sql
create or replace function app.check_order_transition()
returns trigger language plpgsql as $$
declare
  gecerli boolean;
begin
  if new.status = old.status then return new; end if;
  gecerli := case old.status
    when 'olusturuldu'     then new.status in ('eslestirildi','iptal')
    when 'eslestirildi'    then new.status in ('varildi','iptal')
    when 'varildi'         then new.status in ('oncesi_foto_ok','iptal')
    when 'oncesi_foto_ok'  then new.status in ('yikama','iptal')
    when 'yikama'          then new.status = 'sonrasi_foto_ok'
    when 'sonrasi_foto_ok' then new.status in ('musteri_onay','itiraz')
    when 'musteri_onay'    then new.status in ('tamamlandi','itiraz')
    when 'itiraz'          then new.status in ('tamamlandi','iptal')
    else false end;
  if not gecerli then
    raise exception 'Gecersiz durum gecisi: % -> %', old.status, new.status;
  end if;
  insert into app.order_status_transitions(order_id, eski_status, yeni_status, tetikleyen_id)
    values (new.id, old.status, new.status, auth.uid());
  new.updated_at := now();
  return new;
end $$;

create trigger trg_order_transition
  before update of status on app.orders
  for each row execute function app.check_order_transition();
```

> **Karar:** `sonrasi_foto_ok → musteri_onay` geçişinde trigger `onay_penceresi_bitis := now() + interval '24 hours'` set eder. Render üzerinde **dakikalık cron worker** `onay_penceresi_bitis < now() AND status='musteri_onay'` satırlarını `tamamlandi`'ya çeker (PR-5, `confirm_type='auto_24h'`). İtiraz açıkken cron bu satırı atlar (status zaten `itiraz`).

### 3.5 Fotoğraf kanıtları — değişmezlik (PR-2/3/4)

```sql
create type app.foto_evre as enum ('oncesi','sonrasi');
create type app.foto_aci  as enum
  ('on_sol','on_sag','arka_sol','arka_sag','jant','ic_torpido');

create table app.photo_evidence (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references app.orders(id),
  hizmet_veren_id uuid not null references app.profiles(id),
  evre            app.foto_evre not null,
  aci             app.foto_aci not null,
  storage_path    text not null,          -- evidence/{order_id}/{evre}/{aci}.jpg
  sha256          text not null,          -- istemci+sunucu doğrular (immutability)
  gps             geography(Point,4326) not null,
  cekim_ts        timestamptz not null,   -- istemci EXIF
  sunucu_ts       timestamptz not null default now(),  -- güvenilir damga
  cihaz_imza      text,                   -- in-app kamera kanıtı (galeri yüklemesi YASAK)
  created_at      timestamptz not null default now(),
  unique (order_id, evre, aci)            -- her açı bir kez
);
create index idx_evidence_order on app.photo_evidence(order_id, evre);

-- Append-only: UPDATE/DELETE'i DB seviyesinde de kilitle (RLS'e ek savunma)
create rule evidence_no_update as on update to app.photo_evidence do instead nothing;
create rule evidence_no_delete as on delete to app.photo_evidence do instead nothing;
```

**Storage bucket yapısı & imzalı URL stratejisi:**

| Bucket | Erişim | İçerik | İmzalı URL TTL |
|---|---|---|---|
| `evidence` | private | öncesi/sonrası yıkama fotoğrafları | 60 sn (görüntüleme anında üret) |
| `evidence-kyc` | private | adli sicil, kimlik, ikametgah (KVKK) | 60 sn, sadece admin/dispatcher |
| `public-assets` | public | uygulama görselleri, plaza logoları | — (CDN) |

- **Yazma:** Hizmet veren app'i fotoğrafı çeker → SHA-256 istemcide hesaplanır → FastAPI'ye `signed upload URL` istenir → Storage'a yüklenir → FastAPI dosyayı tekrar hash'leyip **istemci hash'iyle karşılaştırır**, eşleşmezse reddeder → `photo_evidence` satırı INSERT (service_role).
- **Okuma:** Müşteri/dispatcher görüntülerken FastAPI 60 sn'lik `createSignedUrl` üretir. Kalıcı public URL **asla** verilmez.
- **Değişmezlik üçlü savunma:** (1) RLS UPDATE/DELETE politikası yok, (2) Postgres RULE `do instead nothing`, (3) SHA-256 + sunucu timestamp + Storage object versioning kapalı/immutable.

### 3.6 İtiraz & puanlama (PR-8, PR-10)

```sql
create type app.dispute_sonuc as enum
  ('hizmet_veren_kusurlu','musteri_reddedildi','platform_karsilar','beklemede');

create table app.disputes (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null unique references app.orders(id),
  acan_id       uuid not null references app.profiles(id),
  sebep         text not null,
  aciklama      text,
  sonuc         app.dispute_sonuc not null default 'beklemede',
  karar_veren_id uuid references app.profiles(id),
  tazminat_tutar numeric(10,2),
  created_at    timestamptz not null default now(),
  cozuldu_at    timestamptz
);
create index idx_disputes_sonuc on app.disputes(sonuc) where sonuc = 'beklemede';

create table app.ratings (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references app.orders(id),
  veren_id      uuid not null references app.profiles(id),
  alan_id       uuid not null references app.profiles(id),
  puan          smallint not null check (puan between 1 and 5),
  yorum         text,
  created_at    timestamptz not null default now(),
  unique (order_id, veren_id)
);
create index idx_ratings_alan on app.ratings(alan_id);

-- Puan girilince hizmet veren ortalamasını güncelle + 4.2 eşik askıya alma (PR-8)
create or replace function app.update_hv_puan() returns trigger
language plpgsql as $$
declare ort numeric(3,2);
begin
  select round(avg(puan),2) into ort from app.ratings
    where alan_id = new.alan_id;
  update app.hizmet_veren_detay
    set ortalama_puan = ort,
        aktif = (durum='onayli' and ort >= 4.2)
    where profile_id = new.alan_id;
  -- 4.2 altına düşerse audit + admin bildirimi event'i
  if ort < 4.2 then
    insert into audit.events(event_type, payload)
      values ('provider_suspended',
              jsonb_build_object('provider_id', new.alan_id, 'avg_score', ort));
  end if;
  return new;
end $$;

create trigger trg_rating_avg after insert on app.ratings
  for each row execute function app.update_hv_puan();
```

---

## 4. Para Akışı — Çift Girişli Defter & Escrow (PR-5/6/7)

### 4.1 Tasarım kararı: append-only ledger

Para hareketleri **asla UPDATE/DELETE edilmez**. Her hareket bir veya daha fazla `ledger_entries` satırı; bakiye = satırların toplamı. Mutabakat ve denetim bu sayede kusursuz.

```sql
create type money.hesap_tipi as enum
  ('escrow','platform_komisyon','koruma_fonu','hizmet_veren_cuzdan','psp_clearing');

create type money.hareket_tipi as enum
  ('escrow_hold','escrow_release','komisyon','koruma_fonu_katki',
   'koruma_fonu_odeme','payout','iade','rucu');

-- Cüzdanlar (hizmet veren bakiyesi)
create table money.wallets (
  id              uuid primary key default gen_random_uuid(),
  hizmet_veren_id uuid not null unique references app.profiles(id),
  bakiye          numeric(12,2) not null default 0,  -- denormalize hız için, ledger ile mutabık
  created_at      timestamptz not null default now()
);

-- Escrow blokeler (1:1 sipariş)
create table money.escrow_holds (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null unique references app.orders(id),
  tutar         numeric(10,2) not null,        -- gmv + koruma_fonu
  psp_provizyon_id text,                        -- Iyzico/PayTR auth/provizyon ref
  durum         text not null default 'bloke',  -- bloke/serbest/iade
  blokedi_at    timestamptz not null default now(),
  serbest_at    timestamptz
);
create index idx_escrow_durum on money.escrow_holds(durum) where durum = 'bloke';

-- Çift girişli defter (append-only)
create table money.ledger_entries (
  id            bigint generated always as identity primary key,
  order_id      uuid references app.orders(id),
  hareket_tipi  money.hareket_tipi not null,
  hesap         money.hesap_tipi not null,
  tutar         numeric(12,2) not null,   -- + giriş / - çıkış (toplamı 0 olmalı/transfer)
  para_birimi   char(3) not null default 'TRY',
  ref           text,                     -- PSP işlem ref / payout batch
  created_at    timestamptz not null default now()
);
create index idx_ledger_order on money.ledger_entries(order_id);
create index idx_ledger_hesap on money.ledger_entries(hesap, created_at);

-- Payout (hizmet verene ödeme batch'i)
create table money.payouts (
  id              uuid primary key default gen_random_uuid(),
  hizmet_veren_id uuid not null references app.profiles(id),
  tutar           numeric(12,2) not null,
  durum           text not null default 'beklemede',  -- beklemede/gonderildi/basarisiz
  psp_payout_id   text,
  created_at      timestamptz not null default now(),
  gonderildi_at   timestamptz
);
```

### 4.2 PSP webhook mutabakat tablosu (idempotent)

Iyzico/PayTR webhook'ları **birden çok kez** gelebilir (at-least-once). Idempotency zorunlu.

```sql
create table money.psp_webhook_events (
  id              uuid primary key default gen_random_uuid(),
  psp             text not null,              -- 'iyzico'/'paytr'
  psp_event_id    text not null,              -- PSP'nin benzersiz olay ID'si
  event_type      text not null,              -- 'auth_success','capture','refund','payout_done'
  order_id        uuid references app.orders(id),
  raw_payload     jsonb not null,
  imza_dogru      boolean not null,           -- HMAC doğrulaması
  islendi         boolean not null default false,
  islendi_at      timestamptz,
  created_at      timestamptz not null default now(),
  unique (psp, psp_event_id)                  -- ← idempotency anahtarı
);
create index idx_webhook_islendi on money.psp_webhook_events(islendi) where islendi = false;
```

**Escrow para akışı (defter satırlarıyla):**

| Adım | Tetikleyici | Ledger hareketleri |
|---|---|---|
| 1. Ödeme bloke | sipariş + PSP provizyon başarılı | `escrow_hold (+) escrow` ; `escrow_hold (-) psp_clearing` |
| 2. Onay/24s | `tamamlandi` | `escrow_release` ; `komisyon (+) platform_komisyon`(99 TL) ; `koruma_fonu_katki (+) koruma_fonu`(15 TL) ; `payout (+) hizmet_veren_cuzdan`(351 TL) |
| 3. Payout | batch | `payout (-) hizmet_veren_cuzdan` ; `money.payouts` satırı |
| 4. İtiraz→platform öder | `platform_karsilar` | `koruma_fonu_odeme (-) koruma_fonu` ; gerekirse `rucu` hizmet_veren_cuzdan'dan |
| 5. İade | iptal/itiraz iadesi | `iade` ; PSP refund |

> **Karar (PR-5 teyit riski):** Iyzico/PayTR gerçek 24s "gecikmeli capture" desteklemiyorsa **fallback**: provizyonu 1. günde al, capture'ı onay/24s tetikleyince yap; PSP provizyon ömrü (genelde 7-30 gün) 24s'i fazlasıyla kapsar. Bu, mevcut PSP yetenekleriyle escrow'u taklit etmenin pratik yolu — yazılım ajanı PSP sözleşmesinde doğrulamalı.

### 4.3 Koruma fonu defteri (PR-7)

`koruma_fonu` hesabı = çift girişli defterin bir hesabı. Fon bakiyesi:
`SELECT SUM(tutar) FROM money.ledger_entries WHERE hesap='koruma_fonu'`.
Her işlemde +15 TL (`koruma_fonu_katki`), hasar ödemesinde -tazminat (`koruma_fonu_odeme`), kusurlu hizmet verenden geri alımda `rucu`. Ayrı tablo gerekmez — defter tek kaynak.

---

## 5. Abonelik & B2B (PR-12/13)

```sql
create table app.subscriptions (
  id            uuid primary key default gen_random_uuid(),
  musteri_id    uuid not null references app.profiles(id),
  plan          text not null,            -- '2_yikama'/'4_yikama'
  aylik_ucret   numeric(10,2) not null,   -- 790 / 1490
  kalan_hak     smallint not null,
  baslangic     date not null,
  yenileme      date not null,
  durum         text not null default 'aktif',  -- aktif/iptal/duraklatildi
  psp_recurring_id text,
  created_at    timestamptz not null default now()
);
create index idx_sub_musteri on app.subscriptions(musteri_id) where durum = 'aktif';

create table app.subscription_usage (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references app.subscriptions(id),
  order_id        uuid not null references app.orders(id),
  kalan_sonrasi   smallint not null,
  created_at      timestamptz not null default now()
);

-- B2B hesaplar (plaza/şirket filo)
create table app.b2b_hesaplar (
  id            uuid primary key default gen_random_uuid(),
  ad            text not null,
  tip           text not null,            -- 'plaza'/'filo'/'kurumsal_kod'
  indirim_kod   text unique,
  gelir_pay_orani numeric(4,3),           -- plaza için %5-8
  created_at    timestamptz not null default now()
);

create table app.b2b_uyelikler (
  id            uuid primary key default gen_random_uuid(),
  b2b_hesap_id  uuid not null references app.b2b_hesaplar(id),
  profile_id    uuid references app.profiles(id),    -- çalışan/sürücü
  yonetici_id   uuid references app.profiles(id),    -- plaza_yonetici
  plaza_id      uuid references app.plazalar(id),
  created_at    timestamptz not null default now()
);
```

---

## 6. Coğrafi Eşleştirme — PostGIS Sorgu Yaklaşımı

### 6.1 Geofence kontrolü (PR-14 — pilot poligonu dışında sipariş yok)

```sql
-- Sipariş oluşturulurken: konum aktif bölge içinde mi?
select exists (
  select 1 from app.hizmet_bolgeleri b
  where b.aktif and ST_Within(:siparis_konum::geometry, b.alan::geometry)
) as bolge_icinde;
```

### 6.2 En yakın N müsait hizmet veren (yarı-manuel dispatch — PR-11)

```sql
-- KNN operatörü (<->) + GIST indeks → ms altı; demirli plaza önceliklendirilir
select hk.hizmet_veren_id,
       hd.ortalama_puan,
       ST_Distance(hk.konum, :musteri_konum) as mesafe_m,
       (hk.demir_plaza_id = :plaza_id) as ayni_plaza
from app.hizmet_veren_konum hk
join app.hizmet_veren_detay hd on hd.profile_id = hk.hizmet_veren_id
where hk.musait = true
  and hd.aktif = true
  and ST_DWithin(hk.konum, :musteri_konum, 3000)   -- 3 km poligon
order by ayni_plaza desc,                           -- demirleme önce
         hd.ortalama_puan desc,
         hk.konum <-> :musteri_konum                -- sonra en yakın (KNN indeks)
limit 5;
```

**Dispatcher** bu 5 adayı görür, algoritmik öneriyi (1. sıra) kabul eder veya override eder. `dispatch_mode` (`auto`/`manual`) `orders`'a yazılır → `order_matched` event'inde raporlanır.

### 6.3 Konum güncelleme yükü

Hizmet veren app'i müsaitken her ~15 sn konum gönderir. 60 aktif hizmet veren (pilot) → ~4 yazma/sn, ihmal edilebilir. Yıl-3'te ~2.000 eşzamanlı hizmet veren → ~130 yazma/sn → tek `hizmet_veren_konum` tablosu (PK upsert) rahat kaldırır. Gerekirse bu tablo `unlogged` yapılabilir (kalıcılık kritik değil, anlık veri).

---

## 7. Audit / Denetim İzi & Event Store

### 7.1 Event taxonomy tablosu (pazarlama §7.3 → tek tablo)

```sql
create table audit.events (
  id            bigint generated always as identity,
  event_type    text not null,         -- 'order_created','escrow_held','order_confirmed'...
  order_id      uuid,
  actor_id      uuid,
  payload       jsonb not null default '{}',
  created_at    timestamptz not null default now()
) partition by range (created_at);

create index idx_events_type_ts on audit.events(event_type, created_at);
create index idx_events_order on audit.events(order_id);
create index idx_events_payload on audit.events using gin(payload);
```

**Pazarlama event taxonomy → `event_type` değerleri** (§7.3 birebir):
`order_created, order_matched, provider_arrived, before_photos_submitted, wash_completed, after_photos_submitted, escrow_held, order_confirmed, escrow_released, dispute_opened, dispute_resolved, provider_rating, provider_suspended, subscription_started, subscription_consumed`.

**NSM formülü (materialized view, haftalık tazelenir):**

```sql
create materialized view audit.nsm_haftalik as
select date_trunc('week', e.created_at) as hafta,
       count(*) filter (
         where e.event_type='order_confirmed'
         and not exists (select 1 from app.disputes d where d.order_id = e.order_id)
       ) as nsm_onayli_yikama
from audit.events e
group by 1;
-- Refresh: Render cron her saat → REFRESH MATERIALIZED VIEW CONCURRENTLY
```

### 7.2 Admin/operasyon denetim izi (KVKK)

```sql
create table audit.admin_actions (
  id            bigint generated always as identity primary key,
  actor_id      uuid not null references app.profiles(id),
  action        text not null,        -- 'kyc_onay','dispute_karar','hv_askiya_al','foto_goruntule'
  hedef_tip     text, hedef_id uuid,
  detay         jsonb,
  ip_adres      inet,
  created_at    timestamptz not null default now()
);
create index idx_admin_actions_actor on audit.admin_actions(actor_id, created_at);
```

> **KVKK kararı:** KYC belgesi/fotoğraf görüntüleme dahil **her hassas veri erişimi** `audit.admin_actions`'a loglanır (kim, ne zaman, hangi belge). Adli sicil belgeleri `evidence-kyc` bucket'ında, dava/yasal saklama yükümlülüğü bitince **silme görevi** (retention cron) ile temizlenir.

---

## 8. Ölçeklenebilirlik Planı (Yıl-3: 500k işlem/yıl)

### 8.1 Hacim tahmini

| Varlık | İşlem başı | Yıl-3 yıllık | Yıl-3 toplam (kümülatif ~3 yıl) |
|---|---|---|---|
| `orders` | 1 | 500k | ~620k satır |
| `audit.events` | ~14 | **7M/yıl** | ~9M satır |
| `photo_evidence` | ~12 (6 öncesi+6 sonrası) | **6M/yıl** | ~8M satır |
| `ledger_entries` | ~5 | 2.5M/yıl | ~3M satır |
| `psp_webhook_events` | ~3 | 1.5M/yıl | ~2M satır |

**Sonuç:** `orders` (620k) tek Postgres için **önemsiz**. Asıl yük `audit.events` ve `photo_evidence` satır sayısında — ama bunlar bile orta ölçek. Supabase'in Pro/Team planı (8-16 GB RAM, 4-8 vCPU) Yıl-3'ü **partition + doğru indeks** ile rahat taşır.

### 8.2 Partition stratejisi

- **`audit.events`** → **aylık range partition** (`created_at`). Sıcak: son 3 ay sorgulanır; eski partition'lar `pg_dump` ile soğuk depoya/ayrı tabloya atılıp drop edilebilir. Analitik sorgular partition pruning'den faydalanır.
- **`photo_evidence`** → tablo küçük (referans + hash) ama **asıl dosyalar Storage'da**; DB satırı partition gerektirmez (8M satır indeksli sorun değil). Storage tarafında **bucket lifecycle**: 90 gün sonra "infrequent access" tier, 1 yıl sonra arşiv (itiraz/yasal saklama bitince).
- **`ledger_entries`** → partition **gerekmez** (append-only, indeksli okuma order_id/hesap bazlı hızlı). 10M satıra kadar tek tablo iyi.

```sql
-- Aylık partition örneği (Render cron her ay yeni partition açar)
create table audit.events_2026_07 partition of audit.events
  for values from ('2026-07-01') to ('2026-08-01');
```

### 8.3 Sıcak / soğuk veri ayrımı

| Katman | Veri | Saklama |
|---|---|---|
| **Sıcak** (Postgres) | son 90 gün orders+events+evidence ref | hızlı, indeksli |
| **Ilık** (Postgres eski partition) | 90 gün – 1 yıl | sorgulanabilir, partition pruning |
| **Soğuk** (Storage arşiv / dış DWH) | 1 yıl+ analitik, kapanmış işlemler | ucuz; BigQuery/ClickHouse'a ETL adayı (Yıl-3 BI ihtiyacı) |

### 8.4 Okuma yükü & read replica

- Operasyon dashboard'u ve B2B raporları **ağır okuma**. Supabase Pro **read replica** sunar → analitik/dashboard sorguları replica'ya, transactional yazma primary'ye. NSM materialized view zaten okuma yükünü tamponlar.
- Dispatcher canlı harita (PostGIS) sık okur → `hizmet_veren_konum` GIST indeksi + gerekirse `unlogged` tablo.

### 8.5 Supabase limitleri & çıkış stratejisi

| Konu | Risk | Karar |
|---|---|---|
| Connection limit | FastAPI çok bağlantı açabilir | **Supabase Supavisor (pooler) ZORUNLU** — Render'dan transaction-mode pooler (port 6543) ile bağlan, doğrudan 5432 değil |
| Storage maliyeti | foto hacmi | Storage lifecycle + WebP sıkıştırma (yükleme öncesi istemcide), 1080p yeterli |
| Compute büyümesi | Yıl-3 yük | Supabase plan yükselt (Team/Enterprise) → yetmezse **çıkış: kendi yönetilen Postgres'e (AWS RDS/Aurora) taşı**. Şema saf Postgres+PostGIS olduğu için Supabase'e kilitlenme yok; Auth/Storage ayrıştırılabilir |
| Vendor lock | Auth & Storage Supabase'e özgü | RLS standart Postgres; Auth JWT standart; Storage S3-uyumlu → taşınabilir |

> **Çıkış stratejisi özeti:** Tüm domain saf Postgres + PostGIS. Supabase'in özel kısmı yalnızca Auth ve Storage; ikisi de S3/JWT standardı. Yıl-3'te ölçek aşarsa **veriyi kaybetmeden** RDS Aurora + ayrı object storage + Auth0/Cognito'ya çıkış mümkün. Bu yüzden domain'i `auth.users` dışında **Supabase-bağımsız** tasarladık.

---

## 9. İndeksleme & Performans Karar Tablosu

| Tablo | Kritik sorgu | İndeks |
|---|---|---|
| `orders` | müşteri/HV sipariş listesi | `(musteri_id, created_at desc)`, `(hizmet_veren_id, created_at desc)` |
| `orders` | açık siparişler (dispatch) | partial: `status WHERE status not in ('tamamlandi','iptal')` |
| `orders` | 24s otomatik onay cron | partial: `(onay_penceresi_bitis) WHERE status='musteri_onay'` |
| `hizmet_veren_konum` | en yakın müsait | GIST `(konum)` + partial `WHERE musait` |
| `photo_evidence` | sipariş kanıt paneli | `(order_id, evre)` |
| `ledger_entries` | hesap bakiye / sipariş defteri | `(hesap, created_at)`, `(order_id)` |
| `psp_webhook_events` | idempotency | unique `(psp, psp_event_id)`, partial `WHERE islendi=false` |
| `audit.events` | event tipi zaman aralığı | `(event_type, created_at)` + GIN `payload` |
| `disputes` | açık itirazlar | partial `WHERE sonuc='beklemede'` |

---

## 10. Bir Sonraki Ajana Devir Notları

- **Yazılım/Backend ajanı:** Bu doküman tüm `CREATE TABLE` + RLS + trigger taslağını içerir; doğrudan Supabase migration'a (`supabase/migrations/`) dökülebilir. **Kritik yol:** (1) `app.check_order_transition` trigger'ı durum makinesini DB'de zorlar — uygulama buna güvenebilir; (2) `money.psp_webhook_events.unique(psp,psp_event_id)` idempotency anahtarı webhook handler'da MUTLAK; (3) `photo_evidence` RLS'te UPDATE/DELETE politikası YOK + RULE `do instead nothing` = değişmezlik; (4) `money`/`audit` şemaları yalnızca `service_role` → FastAPI bu şemalara service key ile erişir, mobil app asla.
- **Bağlantı:** Render → Supabase bağlantısı **Supavisor transaction pooler (port 6543)** üzerinden; FastAPI'de SQLAlchemy `pool_size` küçük tutulmalı (pooler zaten multiplexliyor).
- **Config sabitleri (pazarlamadan):** komisyon 0.220, koruma_fonu 15.00, abonelik 790/1490, AOV 450 → bunlar `orders`'a **işlem anında kopyalanır** (sonradan fiyat değişse de eski sipariş donar). Ayrı `app.config` tablosu veya backend env ile yönetilir.
- **Cron worker'lar (Render background):** (a) 24s otomatik onay (`onay_penceresi_bitis` taraması, dakikalık), (b) NSM materialized view refresh (saatlik), (c) aylık `audit.events` partition oluşturma, (d) payout batch, (e) KVKK retention silme. Beşi de tek background worker'da zamanlanabilir.
- **Finansal model ajanı:** `money.ledger_entries` `hesap` bazlı SUM → gerçek GMV/komisyon/fon bakiyesi/payout tek sorguyla; birim ekonomi (§4.4 pazarlama) bu defterle doğrulanabilir.
- **PSP teyit riski (açık):** Iyzico/PayTR 24s gecikmeli capture mi yoksa provizyon-then-capture fallback mi → yazılım ajanı PSP sözleşmesinde doğrulamalı (§4.2). Şema her iki senaryoyu da kaldırır.
- **Açık konu:** B2B gelir paylaşımı raporu (PR-13) için ayrı materialized view gerekebilir (plaza bazlı GMV × pay oranı); pilotta P1 olduğu için ertelendi.
