-- =====================================================================
-- WashApp — 0004_services.sql
-- Hizmet katalogu (yikama DISI: yag/lastik/bakim/ic temizlik...) + randevu talepleri.
--
-- Model karari (kullanici onayi): ESNEK — her hizmette bayraklar:
--   foto_kanit_gerekli : true  -> 3-Kalkan foto kaniti (yikama/detay)
--   randevu_modu       : true  -> fotosuz "talep/randevu" (yag/lastik/bakim)
--
--   * randevu_modu=false hizmetler MEVCUT app.orders akisindan gecer (foto+escrow).
--     orders.hizmet_id ile katalog fiyatina baglanir (paket geriye-uyum korunur).
--   * randevu_modu=true hizmetler app.hizmet_talepleri'ne yazilir (saglayici iletisim).
--     -> orders durum makinesi (foto zorunlu) DEGISMEZ; F1 bozulmaz.
--
-- Altin kural: katalog LISTELEME okuma -> Supabase RLS. Talep YAZMA -> FastAPI.
-- Idempotent: IF NOT EXISTS + ON CONFLICT (kod) DO NOTHING.
-- Fiyatlar PLACEHOLDER (pilot) — operasyon guncelleyecek.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Kategoriler
-- ---------------------------------------------------------------------
create table if not exists app.hizmet_kategorileri (
  id     uuid primary key default gen_random_uuid(),
  kod    text not null unique,             -- 'yikama','ic_bakim','yag_filtre','lastik','genel_bakim'
  ad     text not null,
  ikon   text not null default 'grid',     -- Feather ikon adi (mobil)
  sira   int not null default 0,
  aktif  boolean not null default true
);

-- ---------------------------------------------------------------------
-- 2. Hizmetler (kategori altinda; taban_fiyat + bayraklar)
-- ---------------------------------------------------------------------
create table if not exists app.hizmetler (
  id                 uuid primary key default gen_random_uuid(),
  kategori_id        uuid not null references app.hizmet_kategorileri(id) on delete cascade,
  kod                text not null unique,          -- 'standart','yag_degisimi',...
  ad                 text not null,
  aciklama           text,
  taban_fiyat        numeric(10,2) not null,        -- pilot placeholder
  sure_dk            int,                            -- tahmini sure (dk)
  ikon               text not null default 'tool',
  foto_kanit_gerekli boolean not null default true,  -- 3-Kalkan foto
  randevu_modu       boolean not null default false, -- true = fotosuz talep akisi
  suv_ek             boolean not null default true,   -- SUV +%15 uygulanir mi
  sira               int not null default 0,
  aktif              boolean not null default true,
  created_at         timestamptz not null default now()
);
create index if not exists idx_hizmet_kategori on app.hizmetler(kategori_id, sira desc);

-- ---------------------------------------------------------------------
-- 3. orders.hizmet_id — siparisi katalog hizmetine bagla (geriye-uyum: nullable)
-- ---------------------------------------------------------------------
alter table app.orders
  add column if not exists hizmet_id uuid references app.hizmetler(id);
create index if not exists idx_orders_hizmet on app.orders(hizmet_id);

-- ---------------------------------------------------------------------
-- 4. Randevu talepleri (randevu_modu hizmetler — fotosuz)
-- ---------------------------------------------------------------------
create table if not exists app.hizmet_talepleri (
  id            uuid primary key default gen_random_uuid(),
  musteri_id    uuid not null references app.profiles(id) on delete cascade,
  hizmet_id     uuid not null references app.hizmetler(id),
  arac_id       uuid references app.araclar(id),
  plaza_id      uuid references app.plazalar(id),
  kat_park_no   text,
  notlar        text,
  tercih_zaman  timestamptz,                 -- musterinin tercih ettigi zaman
  tahmini_fiyat numeric(10,2),               -- katalogdan snapshot (gosterim)
  konum         geography(Point,4326),
  durum         text not null default 'yeni',-- yeni/iletildi/planlandi/tamamlandi/iptal
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_talep_musteri on app.hizmet_talepleri(musteri_id, created_at desc);
create index if not exists idx_talep_durum on app.hizmet_talepleri(durum) where durum = 'yeni';

-- ---------------------------------------------------------------------
-- 5. RLS + grant
-- ---------------------------------------------------------------------
alter table app.hizmet_kategorileri enable row level security;
alter table app.hizmetler           enable row level security;
alter table app.hizmet_talepleri    enable row level security;

-- Katalog: authenticated yalniz aktif olanlari okur; yazma admin/backend.
drop policy if exists kategori_read on app.hizmet_kategorileri;
create policy kategori_read on app.hizmet_kategorileri for select using ( aktif = true );
drop policy if exists kategori_admin on app.hizmet_kategorileri;
create policy kategori_admin on app.hizmet_kategorileri for all
  using ( app.is_admin() ) with check ( app.is_admin() );

drop policy if exists hizmet_read on app.hizmetler;
create policy hizmet_read on app.hizmetler for select using ( aktif = true );
drop policy if exists hizmet_admin on app.hizmetler;
create policy hizmet_admin on app.hizmetler for all
  using ( app.is_admin() ) with check ( app.is_admin() );

grant select on app.hizmet_kategorileri to anon, authenticated;
grant select on app.hizmetler           to anon, authenticated;

-- Talepler: musteri kendi taleplerini OKUR; staff hepsini. Yazma YOK (grant/policy) ->
--   olusturma yalniz FastAPI (service_role) uzerinden (altin kural).
drop policy if exists talep_self_select on app.hizmet_talepleri;
create policy talep_self_select on app.hizmet_talepleri for select
  using ( musteri_id = auth.uid() or app.is_staff() );
grant select on app.hizmet_talepleri to authenticated;

-- ---------------------------------------------------------------------
-- 6. Seed — kategoriler + hizmetler (placeholder fiyat; idempotent)
-- ---------------------------------------------------------------------
insert into app.hizmet_kategorileri (kod, ad, ikon, sira) values
  ('yikama',      'Yıkama',              'droplet', 100),
  ('ic_bakim',    'İç Bakım & Temizlik', 'wind',     90),
  ('yag_filtre',  'Yağ & Filtre',        'droplet',  80),
  ('lastik',      'Lastik & Jant',       'disc',     70),
  ('genel_bakim', 'Genel Bakım',         'tool',     60)
on conflict (kod) do nothing;

-- Yikama (mevcut paketlerle ayni kod -> orders.paket geriye-uyum) — foto+escrow
insert into app.hizmetler (kategori_id, kod, ad, aciklama, taban_fiyat, sure_dk, ikon, foto_kanit_gerekli, randevu_modu, sira)
select k.id, v.kod, v.ad, v.aciklama, v.fiyat, v.sure, v.ikon, true, false, v.sira
from app.hizmet_kategorileri k
join (values
  ('yikama','dis_hizli','Dış Hızlı',    'Dış + cam + jant',        280.00, 30, 'zap',   30),
  ('yikama','standart', 'Standart',      'Dış + iç + torpido',      450.00, 45, 'star',  20),
  ('yikama','premium',  'Premium Detay', 'Buhar + koku + cila',     750.00, 75, 'award', 10)
) as v(kat, kod, ad, aciklama, fiyat, sure, ikon, sira) on v.kat = k.kod
on conflict (kod) do nothing;

-- Ic bakim/detay — full akis (foto+escrow), biri randevu (ekipman gerektiren)
insert into app.hizmetler (kategori_id, kod, ad, aciklama, taban_fiyat, sure_dk, ikon, foto_kanit_gerekli, randevu_modu, sira)
select k.id, v.kod, v.ad, v.aciklama, v.fiyat, v.sure, v.ikon, v.foto, v.randevu, v.sira
from app.hizmet_kategorileri k
join (values
  ('ic_bakim','ic_temizlik','İç Detaylı Temizlik','Torpido + koltuk yüzey + cam', 400.00, 40, 'wind', true,  false, 20),
  ('ic_bakim','koltuk_yikama','Koltuk & Döşeme Yıkama','Derinlemesine döşeme (ekipmanlı)', 900.00, 90, 'grid', false, true, 10)
) as v(kat, kod, ad, aciklama, fiyat, sure, ikon, foto, randevu, sira) on v.kat = k.kod
on conflict (kod) do nothing;

-- Yag & Filtre — randevu (fotosuz)
insert into app.hizmetler (kategori_id, kod, ad, aciklama, taban_fiyat, sure_dk, ikon, foto_kanit_gerekli, randevu_modu, suv_ek, sira)
select k.id, v.kod, v.ad, v.aciklama, v.fiyat, v.sure, v.ikon, false, true, false, v.sira
from app.hizmet_kategorileri k
join (values
  ('yag_filtre','yag_degisimi','Motor Yağı & Filtre','Yağ + yağ filtresi değişimi (parça hariç tahmini)', 1500.00, 45, 'droplet', 20),
  ('yag_filtre','filtre_seti', 'Filtre Seti','Hava + polen + yakıt filtresi', 900.00, 40, 'filter', 10)
) as v(kat, kod, ad, aciklama, fiyat, sure, ikon, sira) on v.kat = k.kod
on conflict (kod) do nothing;

-- Lastik & Jant — randevu
insert into app.hizmetler (kategori_id, kod, ad, aciklama, taban_fiyat, sure_dk, ikon, foto_kanit_gerekli, randevu_modu, suv_ek, sira)
select k.id, v.kod, v.ad, v.aciklama, v.fiyat, v.sure, v.ikon, false, true, false, v.sira
from app.hizmet_kategorileri k
join (values
  ('lastik','lastik_degisim','Lastik Değişimi','4 lastik söküm-takım + balans (işçilik)', 600.00, 60, 'disc', 20),
  ('lastik','balans_rot','Balans & Rot Ayarı','Ön düzen + balans', 800.00, 60, 'settings', 10)
) as v(kat, kod, ad, aciklama, fiyat, sure, ikon, sira) on v.kat = k.kod
on conflict (kod) do nothing;

-- Genel Bakim — randevu
insert into app.hizmetler (kategori_id, kod, ad, aciklama, taban_fiyat, sure_dk, ikon, foto_kanit_gerekli, randevu_modu, suv_ek, sira)
select k.id, v.kod, v.ad, v.aciklama, v.fiyat, v.sure, v.ikon, false, true, false, v.sira
from app.hizmet_kategorileri k
join (values
  ('genel_bakim','aku_degisim','Akü Değişimi','Yerinde akü değişimi (parça hariç işçilik)', 500.00, 30, 'battery-charging', 20),
  ('genel_bakim','periyodik','Periyodik Bakım','Genel kontrol + sıvı seviyeleri', 2500.00, 120, 'tool', 10)
) as v(kat, kod, ad, aciklama, fiyat, sure, ikon, sira) on v.kat = k.kod
on conflict (kod) do nothing;

-- =====================================================================
-- SON: 0004_services.sql tamamlandi.
-- =====================================================================
