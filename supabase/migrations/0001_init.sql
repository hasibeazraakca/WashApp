-- =====================================================================
-- WashApp — 0001_init.sql
-- Kapida mobil oto yikama marketplace — cekirdek sema (02-veri-mimarisi.md)
-- Stack: Supabase (Postgres + PostGIS + Auth + Storage + RLS), Frankfurt/eu-central-1
-- Bu migration: 4 sema (app/money/audit/geo) + PostGIS + tum CREATE TABLE'lar +
--               FK + indeksler (GIST dahil) + siparis durum makinesi trigger +
--               photo_evidence append-only RULE + RLS + politikalar.
--
-- Idempotent-dostu: extension/schema IF NOT EXISTS, enum'lar DO-bloku ile korumali.
-- Tablolar CREATE TABLE IF NOT EXISTS (mevcutsa atlanir; sema evrimi sonraki migration'larda).
--
-- KRITIK GUVENLIK KARARI (02-veri §2.1, 00-MASTER §86,147):
--   money.* ve audit.* semalarinda RLS ACIK ama POLITIKA YOK = pratikte kilitli.
--   Yalniz service_role (FastAPI'nin Render env'indeki gizli anahtari) erisir.
--   anon/authenticated rollerine bu semalarda hicbir dogrudan grant verilmez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Uzantilar (extensions)
-- ---------------------------------------------------------------------
create extension if not exists postgis;          -- cografi tipler + KNN + GIST
create extension if not exists "pgcrypto";        -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- 1. Semalar (4 sema: app / money / audit / geo)
--    geo: referans poligonlar (pilot mikro-bolge); app domain'i kullanir.
-- ---------------------------------------------------------------------
create schema if not exists app;
create schema if not exists money;
create schema if not exists audit;
create schema if not exists geo;

-- Sema-seviyesi erisim kararlari:
--  app    -> authenticated RLS ile (asagida tablo bazli politika)
--  geo    -> referans veri; authenticated SELECT (poligon okuma), yazma service_role
--  money  -> SADECE service_role (asagida tum grant'lar revoke; RLS acik, politika yok)
--  audit  -> SADECE service_role (kisitli okuma yalniz backend uzerinden)
revoke all on schema money from anon, authenticated;
revoke all on schema audit from anon, authenticated;
grant usage on schema app    to anon, authenticated;
grant usage on schema geo    to anon, authenticated;

-- =====================================================================
-- 2. JWT rol yardimci fonksiyonlari (RLS politikalarinin temeli, 02-veri §2.2)
--    role yalniz guvenilir backend (service_role) tarafindan app_metadata'ya
--    yazilir; kullanici user_metadata ile yetki yukseltemez.
-- =====================================================================
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

-- =====================================================================
-- 3. ENUM tipleri (DO-bloku ile idempotent: yeniden calistirma guvenli)
-- =====================================================================
do $$ begin
  create type app.user_role as enum
    ('musteri','hizmet_veren','dispatcher','plaza_yonetici','admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.onboarding_durum as enum
    ('basvuru','belge_bekliyor','incelemede','egitim','onayli','reddedildi','askida');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.order_status as enum (
    'olusturuldu','eslestirildi','varildi','oncesi_foto_ok',
    'yikama','sonrasi_foto_ok','musteri_onay','tamamlandi','itiraz','iptal'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.foto_evre as enum ('oncesi','sonrasi');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.foto_aci as enum
    ('on_sol','on_sag','arka_sol','arka_sag','jant','ic_torpido');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.dispute_sonuc as enum
    ('hizmet_veren_kusurlu','musteri_reddedildi','platform_karsilar','beklemede');
exception when duplicate_object then null; end $$;

do $$ begin
  create type money.hesap_tipi as enum
    ('escrow','platform_komisyon','koruma_fonu','hizmet_veren_cuzdan','psp_clearing');
exception when duplicate_object then null; end $$;

do $$ begin
  create type money.hareket_tipi as enum
    ('escrow_hold','escrow_release','komisyon','koruma_fonu_katki',
     'koruma_fonu_odeme','payout','iade','rucu');
exception when duplicate_object then null; end $$;

-- =====================================================================
-- 4. APP SEMASI — profiller, KYC/onboarding, araclar
-- =====================================================================

-- 4.1 Profiller (auth.users 1:1 uzanti)
create table if not exists app.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  role          app.user_role not null default 'musteri',
  ad_soyad      text not null,
  telefon       text unique,            -- E.164: +905xxxxxxxxx
  email         text,
  kvkk_onay_ts  timestamptz,            -- aydinlatma metni onayi (onaysiz islem yok)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_profiles_role on app.profiles(role);

-- 4.2 Hizmet veren KYC/onboarding durumu (PR-9)
create table if not exists app.hizmet_veren_detay (
  profile_id        uuid primary key references app.profiles(id) on delete cascade,
  durum             app.onboarding_durum not null default 'basvuru',
  adli_sicil_ok     boolean not null default false,
  kimlik_ok         boolean not null default false,
  ikametgah_ok      boolean not null default false,
  ekipman_ok        boolean not null default false,   -- foto/video mulakat
  egitim_ok         boolean not null default false,
  ortalama_puan     numeric(3,2),                     -- 4.2 esik (PR-8)
  toplam_is         int not null default 0,
  iban              text,                              -- payout
  -- PSP nezdinde alt uye isyeri (submerchant) referansi (00-MASTER escrow karari)
  psp_submerchant_id text,
  aktif             boolean not null default false,    -- durum=onayli && puan>=4.2
  son_konum_ts      timestamptz
);
create index if not exists idx_hv_aktif on app.hizmet_veren_detay(aktif) where aktif = true;

-- 4.3 Onboarding belgeleri (dosya Storage'da, DB referans + SHA-256 hash)
create table if not exists app.onboarding_belgeleri (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references app.profiles(id) on delete cascade,
  belge_tipi    text not null,            -- 'adli_sicil','kimlik','ikametgah','ekipman_video'
  storage_path  text not null,            -- evidence-kyc/{profile_id}/{uuid}.pdf
  sha256        text not null,
  durum         text not null default 'incelemede',  -- incelemede/onay/red
  inceleyen_id  uuid references app.profiles(id),
  created_at    timestamptz not null default now()
);
create index if not exists idx_onboarding_profile on app.onboarding_belgeleri(profile_id);

-- 4.4 Araclar
create table if not exists app.araclar (
  id            uuid primary key default gen_random_uuid(),
  musteri_id    uuid not null references app.profiles(id) on delete cascade,
  plaka         text not null,
  marka         text,
  model         text,
  renk          text,
  arac_tipi     text not null default 'sedan',  -- sedan/suv/hatchback (SUV +%15)
  created_at    timestamptz not null default now(),
  unique (musteri_id, plaka)
);
create index if not exists idx_araclar_musteri on app.araclar(musteri_id);

-- =====================================================================
-- 5. GEO SEMASI — referans poligonlar + APP plazalar/canli konum (PostGIS)
--    (02-veri §3.3 — geofence PR-14)
-- =====================================================================

-- 5.1 Pilot mikro-bolge poligonu (Maslak-Levent-Buyukdere ekseni) — geo semasi
create table if not exists geo.hizmet_bolgeleri (
  id          uuid primary key default gen_random_uuid(),
  ad          text not null,                 -- 'Pilot: Buyukdere Ekseni'
  alan        geography(Polygon,4326) not null,
  aktif       boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_bolge_alan on geo.hizmet_bolgeleri using gist(alan);

-- 5.2 Plazalar (app domain, bolge_id geo'ya bagli) — gelir paylasimi PR-13
create table if not exists app.plazalar (
  id              uuid primary key default gen_random_uuid(),
  ad              text not null,                 -- 'Sapphire','Kanyon','Metrocity'...
  konum           geography(Point,4326) not null,
  bolge_id        uuid references geo.hizmet_bolgeleri(id),
  b2b_hesap_id    uuid,                          -- gelir paylasimi (PR-13); FK 6.x'te
  gelir_pay_orani numeric(4,3) default 0.060,    -- %5-8
  created_at      timestamptz not null default now()
);
create index if not exists idx_plaza_konum on app.plazalar using gist(konum);
create index if not exists idx_plaza_bolge on app.plazalar(bolge_id);

-- 5.3 Hizmet verenin canli konumu (eslestirme icin sik guncellenir; PK upsert)
create table if not exists app.hizmet_veren_konum (
  hizmet_veren_id uuid primary key references app.profiles(id) on delete cascade,
  konum           geography(Point,4326) not null,
  musait          boolean not null default false,
  demir_plaza_id  uuid references app.plazalar(id),  -- "demirleme"/lokasyon kilidi (PR-11)
  guncellendi     timestamptz not null default now()
);
create index if not exists idx_hv_konum_gist on app.hizmet_veren_konum using gist(konum);
create index if not exists idx_hv_musait on app.hizmet_veren_konum(musait) where musait = true;

-- =====================================================================
-- 6. APP SEMASI — B2B (plaza/filo) — orders'tan ONCE (plazalar.b2b_hesap_id FK icin)
--    (02-veri §5 — PR-12/13)
-- =====================================================================
create table if not exists app.b2b_hesaplar (
  id              uuid primary key default gen_random_uuid(),
  ad              text not null,
  tip             text not null,            -- 'plaza'/'filo'/'kurumsal_kod'
  indirim_kod     text unique,
  gelir_pay_orani numeric(4,3),             -- plaza icin %5-8
  created_at      timestamptz not null default now()
);

create table if not exists app.b2b_uyelikler (
  id            uuid primary key default gen_random_uuid(),
  b2b_hesap_id  uuid not null references app.b2b_hesaplar(id),
  profile_id    uuid references app.profiles(id),    -- calisan/surucu
  yonetici_id   uuid references app.profiles(id),    -- plaza_yonetici
  plaza_id      uuid references app.plazalar(id),
  created_at    timestamptz not null default now()
);
create index if not exists idx_b2b_uye_hesap on app.b2b_uyelikler(b2b_hesap_id);
create index if not exists idx_b2b_uye_yonetici on app.b2b_uyelikler(yonetici_id);
create index if not exists idx_b2b_uye_plaza on app.b2b_uyelikler(plaza_id);

-- plazalar.b2b_hesap_id -> b2b_hesaplar FK (tablo simdi mevcut)
do $$ begin
  alter table app.plazalar
    add constraint fk_plaza_b2b foreign key (b2b_hesap_id)
    references app.b2b_hesaplar(id);
exception when duplicate_object then null; end $$;

-- =====================================================================
-- 7. APP SEMASI — Siparisler & durum makinesi (PR-1)
-- =====================================================================
create table if not exists app.orders (
  id                uuid primary key default gen_random_uuid(),
  musteri_id        uuid not null references app.profiles(id),
  hizmet_veren_id   uuid references app.profiles(id),
  arac_id           uuid not null references app.araclar(id),
  plaza_id          uuid references app.plazalar(id),
  kat_park_no       text,                          -- 'B2 - 142'
  paket             text not null,                 -- 'dis_hizli','standart','premium'
  arac_tipi         text not null default 'sedan',
  -- Para anlik goruntusu (config'ten kopyalanir, sonradan DEGISMEZ — fiyat dondurma)
  gmv               numeric(10,2) not null,        -- 450.00 (AOV)
  komisyon_orani    numeric(4,3) not null default 0.220,   -- %22 sabit
  koruma_fonu       numeric(10,2) not null default 15.00,  -- 15 TL/islem sabit
  hizmet_veren_eline numeric(10,2),                -- gmv - komisyon - fon
  -- Durum makinesi
  status            app.order_status not null default 'olusturuldu',
  dispatch_mode     text,                          -- 'auto'/'manual'
  onay_penceresi_bitis timestamptz,                -- sonrasi_foto_ok + 24s (PR-5)
  konum             geography(Point,4326),         -- siparis GPS (geofence)
  subscription_id   uuid,                          -- abonelikten dusulduyse (FK 8.x'te)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_orders_musteri on app.orders(musteri_id, created_at desc);
create index if not exists idx_orders_hv on app.orders(hizmet_veren_id, created_at desc);
create index if not exists idx_orders_status on app.orders(status)
  where status not in ('tamamlandi','iptal');
create index if not exists idx_orders_plaza on app.orders(plaza_id, created_at desc);
-- 24s otomatik onay cron'u bu indeksi tarar
create index if not exists idx_orders_onay_penceresi on app.orders(onay_penceresi_bitis)
  where status = 'musteri_onay';

-- 7.1 Durum gecis izi (her gecis audit edilir)
create table if not exists app.order_status_transitions (
  id            bigint generated always as identity primary key,
  order_id      uuid not null references app.orders(id),
  eski_status   app.order_status,
  yeni_status   app.order_status not null,
  tetikleyen_id uuid references app.profiles(id),   -- kim/sistem
  sebep         text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_transitions_order
  on app.order_status_transitions(order_id, created_at);

-- 7.2 Durum makinesi DB-zorlamali trigger (gecersiz gecisi reddet — PR-1)
--     Uygulama katmanina guvenilmez; son savunma DB'de.
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

  -- sonrasi_foto_ok -> musteri_onay gecisinde 24s otomatik onay penceresi baslar (PR-5)
  if old.status = 'sonrasi_foto_ok' and new.status = 'musteri_onay' then
    new.onay_penceresi_bitis := now() + interval '24 hours';
  end if;

  insert into app.order_status_transitions(order_id, eski_status, yeni_status, tetikleyen_id)
    values (new.id, old.status, new.status, auth.uid());

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_order_transition on app.orders;
create trigger trg_order_transition
  before update of status on app.orders
  for each row execute function app.check_order_transition();

-- =====================================================================
-- 8. APP SEMASI — Fotograf kanitlari (degismezlik, PR-2/3/4)
-- =====================================================================
create table if not exists app.photo_evidence (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references app.orders(id),
  hizmet_veren_id uuid not null references app.profiles(id),
  evre            app.foto_evre not null,
  aci             app.foto_aci not null,
  storage_path    text not null,          -- evidence/{order_id}/{evre}/{aci}.webp
  sha256          text not null,          -- istemci+sunucu dogrular (immutability)
  gps             geography(Point,4326) not null,
  cekim_ts        timestamptz not null,   -- istemci (vision-camera canli GPS aninda)
  sunucu_ts       timestamptz not null default now(),  -- guvenilir damga
  cihaz_imza      text,                   -- in-app kamera kaniti (galeri yuklemesi YASAK)
  created_at      timestamptz not null default now(),
  unique (order_id, evre, aci)            -- her aci bir kez
);
create index if not exists idx_evidence_order on app.photo_evidence(order_id, evre);

-- Append-only: UPDATE/DELETE'i DB seviyesinde de kilitle (RLS'e ek savunma katmani)
create or replace rule evidence_no_update as
  on update to app.photo_evidence do instead nothing;
create or replace rule evidence_no_delete as
  on delete to app.photo_evidence do instead nothing;

-- =====================================================================
-- 9. APP SEMASI — Itiraz & puanlama (PR-8, PR-10)
-- =====================================================================
create table if not exists app.disputes (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null unique references app.orders(id),
  acan_id        uuid not null references app.profiles(id),
  sebep          text not null,
  aciklama       text,
  sonuc          app.dispute_sonuc not null default 'beklemede',
  karar_veren_id uuid references app.profiles(id),
  tazminat_tutar numeric(10,2),
  created_at     timestamptz not null default now(),
  cozuldu_at     timestamptz
);
create index if not exists idx_disputes_sonuc on app.disputes(sonuc) where sonuc = 'beklemede';

create table if not exists app.ratings (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references app.orders(id),
  veren_id   uuid not null references app.profiles(id),
  alan_id    uuid not null references app.profiles(id),
  puan       smallint not null check (puan between 1 and 5),
  yorum      text,
  created_at timestamptz not null default now(),
  unique (order_id, veren_id)
);
create index if not exists idx_ratings_alan on app.ratings(alan_id);

-- 9.1 Puan girilince hizmet veren ortalamasini guncelle + 4.2 esik askiya alma (PR-8)
--     NOT: audit.events'e yazar (provider_suspended). audit service_role-kilitli ama
--     bu trigger SECURITY DEFINER ile semayi sahibinin haklariyla yazar.
create or replace function app.update_hv_puan() returns trigger
language plpgsql
security definer
set search_path = app, audit, public
as $$
declare ort numeric(3,2);
begin
  select round(avg(puan),2) into ort from app.ratings
    where alan_id = new.alan_id;

  update app.hizmet_veren_detay
    set ortalama_puan = ort,
        aktif = (durum = 'onayli' and ort >= 4.2)
    where profile_id = new.alan_id;

  -- 4.2 altina duserse audit + admin bildirimi event'i
  if ort < 4.2 then
    insert into audit.events(event_type, order_id, actor_id, payload)
      values ('provider_suspended', new.order_id, new.veren_id,
              jsonb_build_object('provider_id', new.alan_id, 'avg_score', ort));
  end if;

  return new;
end $$;

drop trigger if exists trg_rating_avg on app.ratings;
create trigger trg_rating_avg after insert on app.ratings
  for each row execute function app.update_hv_puan();

-- =====================================================================
-- 10. APP SEMASI — Abonelik (PR-12)
-- =====================================================================
create table if not exists app.subscriptions (
  id               uuid primary key default gen_random_uuid(),
  musteri_id       uuid not null references app.profiles(id),
  plan             text not null,            -- '2_yikama'/'4_yikama'
  aylik_ucret      numeric(10,2) not null,   -- 790 / 1490
  kalan_hak        smallint not null,
  baslangic        date not null,
  yenileme         date not null,
  durum            text not null default 'aktif',  -- aktif/iptal/duraklatildi
  psp_recurring_id text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_sub_musteri on app.subscriptions(musteri_id) where durum = 'aktif';

create table if not exists app.subscription_usage (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references app.subscriptions(id),
  order_id        uuid not null references app.orders(id),
  kalan_sonrasi   smallint not null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_sub_usage_sub on app.subscription_usage(subscription_id);

-- orders.subscription_id -> subscriptions FK (tablo simdi mevcut)
do $$ begin
  alter table app.orders
    add constraint fk_orders_subscription foreign key (subscription_id)
    references app.subscriptions(id);
exception when duplicate_object then null; end $$;

-- =====================================================================
-- 11. MONEY SEMASI — Cift girisli defter & escrow (PR-5/6/7)
--     TUMU service_role-kilitli (RLS acik, politika yok).
-- =====================================================================

-- 11.1 Cuzdanlar (hizmet veren bakiyesi; denormalize, ledger ile mutabik)
create table if not exists money.wallets (
  id              uuid primary key default gen_random_uuid(),
  hizmet_veren_id uuid not null unique references app.profiles(id),
  bakiye          numeric(12,2) not null default 0,
  created_at      timestamptz not null default now()
);

-- 11.2 Escrow blokeler (1:1 siparis)
create table if not exists money.escrow_holds (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null unique references app.orders(id),
  tutar            numeric(10,2) not null,        -- gmv + koruma_fonu
  psp_provizyon_id text,                          -- Iyzico/PayTR auth/provizyon ref
  durum            text not null default 'bloke', -- bloke/serbest/iade
  blokedi_at       timestamptz not null default now(),
  serbest_at       timestamptz
);
create index if not exists idx_escrow_durum on money.escrow_holds(durum) where durum = 'bloke';

-- 11.3 Cift girisli defter (append-only — asla UPDATE/DELETE edilmez)
create table if not exists money.ledger_entries (
  id           bigint generated always as identity primary key,
  order_id     uuid references app.orders(id),
  hareket_tipi money.hareket_tipi not null,
  hesap        money.hesap_tipi not null,
  tutar        numeric(12,2) not null,   -- + giris / - cikis
  para_birimi  char(3) not null default 'TRY',
  ref          text,                     -- PSP islem ref / payout batch
  created_at   timestamptz not null default now()
);
create index if not exists idx_ledger_order on money.ledger_entries(order_id);
create index if not exists idx_ledger_hesap on money.ledger_entries(hesap, created_at);

-- ledger_entries de append-only: UPDATE/DELETE DB seviyesinde kilitli (defter butunlugu)
create or replace rule ledger_no_update as
  on update to money.ledger_entries do instead nothing;
create or replace rule ledger_no_delete as
  on delete to money.ledger_entries do instead nothing;

-- 11.4 Payout (hizmet verene odeme batch'i)
create table if not exists money.payouts (
  id              uuid primary key default gen_random_uuid(),
  hizmet_veren_id uuid not null references app.profiles(id),
  tutar           numeric(12,2) not null,
  durum           text not null default 'beklemede',  -- beklemede/gonderildi/basarisiz
  psp_payout_id   text,
  created_at      timestamptz not null default now(),
  gonderildi_at   timestamptz
);
create index if not exists idx_payouts_hv on money.payouts(hizmet_veren_id, created_at desc);
create index if not exists idx_payouts_durum on money.payouts(durum) where durum = 'beklemede';

-- 11.5 PSP webhook mutabakat tablosu (idempotent — MUTLAK, PR-5/6)
--      Iyzico/PayTR webhook'lari at-least-once gelebilir; unique key idempotency saglar.
create table if not exists money.psp_webhook_events (
  id           uuid primary key default gen_random_uuid(),
  psp          text not null,              -- 'iyzico'/'paytr'
  psp_event_id text not null,              -- PSP'nin benzersiz olay ID'si
  event_type   text not null,              -- 'auth_success','capture','refund','payout_done'
  order_id     uuid references app.orders(id),
  raw_payload  jsonb not null,
  imza_dogru   boolean not null,           -- HMAC dogrulamasi
  islendi      boolean not null default false,
  islendi_at   timestamptz,
  created_at   timestamptz not null default now(),
  unique (psp, psp_event_id)               -- <- idempotency anahtari
);
create index if not exists idx_webhook_islendi
  on money.psp_webhook_events(islendi) where islendi = false;

-- NOT (02-veri §4.3): Garanti/koruma fonu defteri AYRI tablo gerektirmez.
--   Fon bakiyesi = SUM(tutar) FROM money.ledger_entries WHERE hesap='koruma_fonu'.
--   +15 TL koruma_fonu_katki, -tazminat koruma_fonu_odeme, kusurlu HV'den rucu.

-- =====================================================================
-- 12. AUDIT SEMASI — denetim izi & event store (§7)
--     TUMU service_role-kilitli.
-- =====================================================================

-- 12.1 Event store — aylik range partition (yuksek hacim: islem basi ~14 event)
create table if not exists audit.events (
  id         bigint generated always as identity,
  event_type text not null,         -- pazarlama §7.3 event taxonomy
  order_id   uuid,
  actor_id   uuid,
  payload    jsonb not null default '{}',
  created_at timestamptz not null default now(),
  primary key (id, created_at)       -- partition key (created_at) PK'ya dahil olmali
) partition by range (created_at);

create index if not exists idx_events_type_ts on audit.events(event_type, created_at);
create index if not exists idx_events_order on audit.events(order_id);
create index if not exists idx_events_payload on audit.events using gin(payload);

-- Baslangic partition'lari (Render cron her ay yeni partition acar — 03-yazilim §2.2c)
-- Idempotent: IF NOT EXISTS partition tablolari.
create table if not exists audit.events_2026_06 partition of audit.events
  for values from ('2026-06-01') to ('2026-07-01');
create table if not exists audit.events_2026_07 partition of audit.events
  for values from ('2026-07-01') to ('2026-08-01');
create table if not exists audit.events_2026_08 partition of audit.events
  for values from ('2026-08-01') to ('2026-09-01');

-- 12.2 Admin/operasyon denetim izi (KVKK — her hassas veri erisimi loglanir)
create table if not exists audit.admin_actions (
  id         bigint generated always as identity primary key,
  actor_id   uuid not null references app.profiles(id),
  action     text not null,        -- 'kyc_onay','dispute_karar','hv_askiya_al','foto_goruntule'
  hedef_tip  text,
  hedef_id   uuid,
  detay      jsonb,
  ip_adres   inet,
  created_at timestamptz not null default now()
);
create index if not exists idx_admin_actions_actor
  on audit.admin_actions(actor_id, created_at);

-- 12.3 NSM (Kuzey Yildizi) materialized view — haftalik itirazsiz onaylanmis yikama
--      Render cron saatlik REFRESH MATERIALIZED VIEW CONCURRENTLY (unique index gerekir).
create materialized view if not exists audit.nsm_haftalik as
select date_trunc('week', e.created_at) as hafta,
       count(*) filter (
         where e.event_type = 'order_confirmed'
         and not exists (select 1 from app.disputes d where d.order_id = e.order_id)
       ) as nsm_onayli_yikama
from audit.events e
group by 1;
-- CONCURRENTLY refresh icin unique index sart
create unique index if not exists idx_nsm_hafta on audit.nsm_haftalik(hafta);

-- =====================================================================
-- 13. RLS — ENABLE + POLITIKALAR
-- =====================================================================

-- ---------------------------------------------------------------------
-- 13.1 APP semasi tablolarinda RLS ACIK + politikalar (02-veri §2.3)
-- ---------------------------------------------------------------------
alter table app.profiles                  enable row level security;
alter table app.hizmet_veren_detay        enable row level security;
alter table app.onboarding_belgeleri      enable row level security;
alter table app.araclar                   enable row level security;
alter table app.plazalar                  enable row level security;
alter table app.hizmet_veren_konum        enable row level security;
alter table app.b2b_hesaplar              enable row level security;
alter table app.b2b_uyelikler             enable row level security;
alter table app.orders                    enable row level security;
alter table app.order_status_transitions  enable row level security;
alter table app.photo_evidence            enable row level security;
alter table app.disputes                  enable row level security;
alter table app.ratings                   enable row level security;
alter table app.subscriptions             enable row level security;
alter table app.subscription_usage        enable row level security;

-- GEO referans poligonlari: RLS acik, herkes (authenticated) okur, yazma service_role
alter table geo.hizmet_bolgeleri          enable row level security;

-- PROFILES: kendi profilini gor; staff hepsini; admin hepsini
drop policy if exists profiles_self_select on app.profiles;
create policy profiles_self_select on app.profiles for select
  using ( id = auth.uid() or app.is_staff() or app.current_role() = 'plaza_yonetici' );

drop policy if exists profiles_self_update on app.profiles;
create policy profiles_self_update on app.profiles for update
  using ( id = auth.uid() ) with check ( id = auth.uid() );

drop policy if exists profiles_admin_all on app.profiles;
create policy profiles_admin_all on app.profiles for all
  using ( app.is_admin() ) with check ( app.is_admin() );

-- HIZMET_VEREN_DETAY: kendi; staff R
drop policy if exists hv_detay_self on app.hizmet_veren_detay;
create policy hv_detay_self on app.hizmet_veren_detay for select
  using ( profile_id = auth.uid() or app.is_staff() );

-- ONBOARDING_BELGELERI: kendi (HV) + staff (R) — KVKK hassas
drop policy if exists onboarding_self on app.onboarding_belgeleri;
create policy onboarding_self on app.onboarding_belgeleri for select
  using ( profile_id = auth.uid() or app.is_staff() );

drop policy if exists onboarding_insert_self on app.onboarding_belgeleri;
create policy onboarding_insert_self on app.onboarding_belgeleri for insert
  with check ( profile_id = auth.uid() );

-- ARACLAR: musteri kendi; HV atandigi siparisin araci (R); staff R
drop policy if exists araclar_self on app.araclar;
create policy araclar_self on app.araclar for all
  using ( musteri_id = auth.uid() ) with check ( musteri_id = auth.uid() );

drop policy if exists araclar_hv_select on app.araclar;
create policy araclar_hv_select on app.araclar for select
  using ( app.is_staff()
          or exists (select 1 from app.orders o
                     where o.arac_id = araclar.id and o.hizmet_veren_id = auth.uid()) );

-- PLAZALAR: herkes (authenticated) okur (siparis verirken plaza secimi)
drop policy if exists plazalar_read on app.plazalar;
create policy plazalar_read on app.plazalar for select using ( true );

drop policy if exists plazalar_admin_write on app.plazalar;
create policy plazalar_admin_write on app.plazalar for all
  using ( app.is_admin() ) with check ( app.is_admin() );

-- GEO bolgeleri: authenticated okur (geofence kontrolu icin)
drop policy if exists bolge_read on geo.hizmet_bolgeleri;
create policy bolge_read on geo.hizmet_bolgeleri for select using ( true );

drop policy if exists bolge_admin_write on geo.hizmet_bolgeleri;
create policy bolge_admin_write on geo.hizmet_bolgeleri for all
  using ( app.is_admin() ) with check ( app.is_admin() );

-- HIZMET_VEREN_KONUM: HV kendi (yazar+okur); staff R
drop policy if exists konum_self_write on app.hizmet_veren_konum;
create policy konum_self_write on app.hizmet_veren_konum for all
  using ( hizmet_veren_id = auth.uid() )
  with check ( hizmet_veren_id = auth.uid() );

drop policy if exists konum_staff_select on app.hizmet_veren_konum;
create policy konum_staff_select on app.hizmet_veren_konum for select
  using ( app.is_staff() );

-- B2B: staff R; plaza_yonetici kendi
drop policy if exists b2b_hesap_staff on app.b2b_hesaplar;
create policy b2b_hesap_staff on app.b2b_hesaplar for select
  using ( app.is_staff() or app.current_role() = 'plaza_yonetici' );

drop policy if exists b2b_uye_staff on app.b2b_uyelikler;
create policy b2b_uye_staff on app.b2b_uyelikler for select
  using ( app.is_staff() or yonetici_id = auth.uid() or profile_id = auth.uid() );

-- ORDERS: musteri kendi; HV atanan; staff hepsi; plaza_yonetici kendi plazasi (R)
drop policy if exists orders_musteri_select on app.orders;
create policy orders_musteri_select on app.orders for select
  using ( musteri_id = auth.uid() );

drop policy if exists orders_hizmet_veren_select on app.orders;
create policy orders_hizmet_veren_select on app.orders for select
  using ( hizmet_veren_id = auth.uid() );

drop policy if exists orders_staff_all on app.orders;
create policy orders_staff_all on app.orders for all
  using ( app.is_staff() ) with check ( app.is_staff() );

drop policy if exists orders_plaza_select on app.orders;
create policy orders_plaza_select on app.orders for select
  using ( app.current_role() = 'plaza_yonetici'
          and plaza_id in (select plaza_id from app.b2b_uyelikler
                           where yonetici_id = auth.uid()) );

-- ORDER_STATUS_TRANSITIONS: siparis taraflari + staff R
drop policy if exists transitions_select on app.order_status_transitions;
create policy transitions_select on app.order_status_transitions for select
  using ( app.is_staff()
          or exists (select 1 from app.orders o where o.id = order_id
                     and (o.musteri_id = auth.uid() or o.hizmet_veren_id = auth.uid())) );

-- PHOTO_EVIDENCE: HV yalniz INSERT eder; kimse UPDATE/DELETE edemez (immutability).
--   UPDATE/DELETE POLITIKASI TANIMLANMAZ -> RLS altinda reddedilir = degismezlik.
drop policy if exists evidence_insert_provider on app.photo_evidence;
create policy evidence_insert_provider on app.photo_evidence for insert
  with check ( app.current_role() = 'hizmet_veren'
               and exists (select 1 from app.orders o
                           where o.id = order_id and o.hizmet_veren_id = auth.uid()) );

drop policy if exists evidence_select_party on app.photo_evidence;
create policy evidence_select_party on app.photo_evidence for select
  using ( exists (select 1 from app.orders o where o.id = order_id
                  and (o.musteri_id = auth.uid() or o.hizmet_veren_id = auth.uid()))
          or app.is_staff() );

-- DISPUTES: acan + atanan HV + staff
drop policy if exists disputes_party_select on app.disputes;
create policy disputes_party_select on app.disputes for select
  using ( acan_id = auth.uid() or app.is_staff()
          or exists (select 1 from app.orders o where o.id = order_id
                     and o.hizmet_veren_id = auth.uid()) );

drop policy if exists disputes_musteri_insert on app.disputes;
create policy disputes_musteri_insert on app.disputes for insert
  with check ( acan_id = auth.uid()
               and exists (select 1 from app.orders o where o.id = order_id
                           and (o.musteri_id = auth.uid() or o.hizmet_veren_id = auth.uid())) );

-- RATINGS: veren/alan + staff R; veren insert
drop policy if exists ratings_party_select on app.ratings;
create policy ratings_party_select on app.ratings for select
  using ( veren_id = auth.uid() or alan_id = auth.uid() or app.is_staff() );

drop policy if exists ratings_insert_self on app.ratings;
create policy ratings_insert_self on app.ratings for insert
  with check ( veren_id = auth.uid() );

-- SUBSCRIPTIONS: musteri kendi; staff R
drop policy if exists sub_self on app.subscriptions;
create policy sub_self on app.subscriptions for select
  using ( musteri_id = auth.uid() or app.is_staff() );

drop policy if exists sub_usage_self on app.subscription_usage;
create policy sub_usage_self on app.subscription_usage for select
  using ( app.is_staff()
          or exists (select 1 from app.subscriptions s
                     where s.id = subscription_id and s.musteri_id = auth.uid()) );

-- ---------------------------------------------------------------------
-- 13.2 MONEY & AUDIT semalari — RLS ACIK + POLITIKA YOK = KILITLI (SEC-1/G5)
--   Hicbir policy tanimlanmaz -> anon/authenticated 0 satir gorur.
--   service_role RLS'i bypass eder (FastAPI yalniz bu key ile erisir).
--   Ek savunma: tum grant'lari revoke et.
-- ---------------------------------------------------------------------
alter table money.wallets             enable row level security;
alter table money.escrow_holds        enable row level security;
alter table money.ledger_entries      enable row level security;
alter table money.payouts             enable row level security;
alter table money.psp_webhook_events  enable row level security;

alter table audit.events              enable row level security;
alter table audit.admin_actions       enable row level security;

-- Grant temizligi: bu semalarda anon/authenticated'a hicbir tablo/sekans hakki yok
revoke all on all tables    in schema money from anon, authenticated;
revoke all on all sequences in schema money from anon, authenticated;
revoke all on all functions in schema money from anon, authenticated;
revoke all on all tables    in schema audit from anon, authenticated;
revoke all on all sequences in schema audit from anon, authenticated;
revoke all on all functions in schema audit from anon, authenticated;

-- Gelecekte olusacak objeler de varsayilan olarak kilitli kalsin
alter default privileges in schema money revoke all on tables from anon, authenticated;
alter default privileges in schema money revoke all on sequences from anon, authenticated;
alter default privileges in schema audit revoke all on tables from anon, authenticated;
alter default privileges in schema audit revoke all on sequences from anon, authenticated;

-- =====================================================================
-- SON: 0001_init.sql tamamlandi.
--   Sonraki migration: 0002_storage_buckets.sql (evidence/evidence-kyc/public-assets).
-- =====================================================================
