-- =====================================================================
-- WashApp — 0003_campaigns.sql
-- Kampanyalar (reklam/sponsor) — "kampanya veren yerler"in kampanyalari.
--   Bir kampanya: gorsel + baslik/aciklama + hangi arac yikamaya (hizmet veren)
--   ait oldugu + tiklanma sayaci. Ana ekranda banner/karusel olarak gosterilir.
--
-- Altin kural: LISTELEME okuma -> Supabase RLS (authenticated select, aktif olanlar).
--              TIKLAMA yazma + sayac -> her zaman FastAPI (service_role).
--   -> app.kampanya_tiklama RLS acik + politika/grant YOK = yalniz backend yazar.
--
-- Idempotent: tablo IF NOT EXISTS, politika drop-then-create, grant tekrar guvenli.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Kampanya tablosu (app semasi)
-- ---------------------------------------------------------------------
create table if not exists app.kampanyalar (
  id               uuid primary key default gen_random_uuid(),
  baslik           text not null,                    -- kampanya yazisi (ust satir)
  aciklama         text,                             -- alt aciklama (opsiyonel)
  gorsel_url       text not null,                    -- afis gorseli (public-assets veya harici URL)
  -- Hangi arac yikamaya (hizmet verene) ait — opsiyonel FK. Kayitli profil yoksa
  -- serbest metin sponsor_ad kullanilir (harici sponsor/plaza kampanyasi).
  hizmet_veren_id  uuid references app.profiles(id) on delete set null,
  sponsor_ad       text,                             -- "kampanya veren yer" gorunen adi
  hedef_url        text,                             -- tiklaninca acilacak baglanti (opsiyonel)
  aktif            boolean not null default true,
  baslangic        date,                             -- null = hemen
  bitis            date,                             -- null = suresiz
  siralama         int not null default 0,           -- gosterim sirasi (buyuk once)
  tiklama_sayisi   bigint not null default 0,        -- denormalize sayac (kampanya_tiklama ile mutabik)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
-- Ana ekran sorgusu: aktif + tarih penceresi, siralama/created_at'e gore
create index if not exists idx_kampanya_aktif
  on app.kampanyalar(siralama desc, created_at desc) where aktif = true;
create index if not exists idx_kampanya_hv on app.kampanyalar(hizmet_veren_id);

-- ---------------------------------------------------------------------
-- 2. Tiklama kaydi (analitik — yalniz backend yazar, service_role)
-- ---------------------------------------------------------------------
create table if not exists app.kampanya_tiklama (
  id           bigint generated always as identity primary key,
  kampanya_id  uuid not null references app.kampanyalar(id) on delete cascade,
  kullanici_id uuid references app.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_kampanya_tiklama_kampanya
  on app.kampanya_tiklama(kampanya_id, created_at desc);

-- ---------------------------------------------------------------------
-- 3. RLS + grant
-- ---------------------------------------------------------------------
alter table app.kampanyalar       enable row level security;
alter table app.kampanya_tiklama  enable row level security;

-- KAMPANYALAR: authenticated yalniz AKTIF + tarih penceresindekileri okur.
--   Yazma (olustur/guncelle) admin veya backend (service_role RLS bypass).
drop policy if exists kampanya_read_active on app.kampanyalar;
create policy kampanya_read_active on app.kampanyalar for select
  using (
    aktif = true
    and (baslangic is null or baslangic <= current_date)
    and (bitis is null or bitis >= current_date)
  );

drop policy if exists kampanya_admin_all on app.kampanyalar;
create policy kampanya_admin_all on app.kampanyalar for all
  using ( app.is_admin() ) with check ( app.is_admin() );

-- Okuma grant'i (RLS ustte filtreler). Yazma grant'i YOK -> service_role/admin.
grant select on app.kampanyalar to anon, authenticated;

-- KAMPANYA_TIKLAMA: politika/grant YOK = kilitli. Tiklama yalniz FastAPI'den
--   (service_role RLS bypass) yazilir; mobil dogrudan yazamaz (altin kural).

-- ---------------------------------------------------------------------
-- 4. Demo veri (pilot ana ekran icin — idempotent seed)
-- ---------------------------------------------------------------------
insert into app.kampanyalar (baslik, aciklama, gorsel_url, sponsor_ad, hedef_url, siralama)
select
  'İlk yıkamaya %25 indirim',
  'Standart pakette geçerli — kapına gelsin, kanıtlı yıkansın.',
  'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?w=1200&q=80',
  'WashApp',
  null,
  100
where not exists (select 1 from app.kampanyalar where baslik = 'İlk yıkamaya %25 indirim');

insert into app.kampanyalar (baslik, aciklama, gorsel_url, sponsor_ad, hedef_url, siralama)
select
  'Premium Detay: jant + iç torpido',
  'SUV''lar dahil premium detaylı yıkama paketi.',
  'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?w=1200&q=80',
  'WashApp Pro',
  null,
  90
where not exists (select 1 from app.kampanyalar where baslik = 'Premium Detay: jant + iç torpido');

-- =====================================================================
-- SON: 0003_campaigns.sql tamamlandi.
-- =====================================================================
