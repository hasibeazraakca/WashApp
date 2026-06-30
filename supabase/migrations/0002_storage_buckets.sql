-- =====================================================================
-- WashApp — 0002_storage_buckets.sql
-- Supabase Storage bucket'lari + erisim politikalari (02-veri §3.5, 03-yazilim §7.3/7.4)
--
-- Bucket'lar:
--   evidence       (private) — oncesi/sonrasi yikama fotograflari. Imzali URL 60 sn.
--   evidence-kyc   (private) — adli sicil/kimlik/ikametgah (KVKK ozel nitelikli).
--                              Sadece admin/dispatcher. Yasal saklama bitince retention
--                              cron siler (<=7 gun ham belge tutma notu; 03-yazilim §7.3).
--   public-assets  (public)  — uygulama gorselleri, plaza logolari. CDN.
--
-- TASARIM KARARI (03-yazilim §2.4):
--   Yazma/okuma akisi FastAPI (service_role) uzerinden gider:
--     - yukleme: backend signed UPLOAD url uretir -> istemci PUT -> backend re-hash dogrular
--     - goruntuleme: backend 60 sn createSignedUrl uretir
--   Bu yuzden bucket'lar private; storage.objects RLS politikalari ek savunma katmanidir.
--   service_role tum RLS'i bypass eder. Asagidaki policy'ler authenticated istemcinin
--   olasi dogrudan erisimini siki tutar (defense-in-depth).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Bucket'lari olustur (idempotent: on conflict do nothing)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('evidence',      'evidence',      false, 10485760,  array['image/webp','image/jpeg','image/png']),
  ('evidence-kyc',  'evidence-kyc',  false, 20971520,  array['image/webp','image/jpeg','image/png','application/pdf','video/mp4']),
  ('public-assets', 'public-assets', true,  5242880,   array['image/webp','image/jpeg','image/png','image/svg+xml'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2. storage.objects erisim politikalari
--    (storage.objects'te RLS Supabase tarafindan zaten acik)
-- ---------------------------------------------------------------------

-- 2.1 evidence (private) — yikama fotograf kaniti
-- Okuma: siparis tarafi (musteri/HV) veya staff. (Pratikte backend signed URL verir;
--        bu policy dogrudan client erisimini de sinirlar.) Path: evidence/{order_id}/{evre}/{aci}.webp
drop policy if exists evidence_read_party on storage.objects;
create policy evidence_read_party on storage.objects for select
  to authenticated
  using (
    bucket_id = 'evidence'
    and (
      app.is_staff()
      or exists (
        select 1 from app.orders o
        where o.id::text = (storage.foldername(name))[1]
          and (o.musteri_id = auth.uid() or o.hizmet_veren_id = auth.uid())
      )
    )
  );

-- Yazma: yalniz atanan hizmet veren, kendi siparisinin klasorune (insert).
-- UPDATE/DELETE politikasi YOK -> degismezlik (foto kaniti silinemez/degistirilemez).
drop policy if exists evidence_insert_provider on storage.objects;
create policy evidence_insert_provider on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'evidence'
    and app.current_role() = 'hizmet_veren'
    and exists (
      select 1 from app.orders o
      where o.id::text = (storage.foldername(name))[1]
        and o.hizmet_veren_id = auth.uid()
    )
  );

-- 2.2 evidence-kyc (private) — KVKK ozel nitelikli, SADECE admin/dispatcher okur.
-- Path: evidence-kyc/{profile_id}/{uuid}.pdf
-- RETENTION NOTU: Ham KYC belgeleri "dogrula-ve-at" ilkesiyle <=7 gun tutulur
--   (00-MASTER G4 / 03-yazilim §7.3). KVKK retention cron'u (03-yazilim §2.2e)
--   saklama suresi dolan objeleri siler. Her goruntuleme audit.admin_actions'a loglanir.
drop policy if exists kyc_read_staff_only on storage.objects;
create policy kyc_read_staff_only on storage.objects for select
  to authenticated
  using ( bucket_id = 'evidence-kyc' and app.is_staff() );

-- KYC yukleme: hizmet veren kendi klasorune (basvuru belgesi). Okuma yine staff-only.
drop policy if exists kyc_insert_self on storage.objects;
create policy kyc_insert_self on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'evidence-kyc'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 2.3 public-assets (public) — CDN ile herkese okuma, yazma yalniz admin
drop policy if exists public_assets_read on storage.objects;
create policy public_assets_read on storage.objects for select
  using ( bucket_id = 'public-assets' );

drop policy if exists public_assets_admin_write on storage.objects;
create policy public_assets_admin_write on storage.objects for insert
  to authenticated
  with check ( bucket_id = 'public-assets' and app.is_admin() );

drop policy if exists public_assets_admin_update on storage.objects;
create policy public_assets_admin_update on storage.objects for update
  to authenticated
  using ( bucket_id = 'public-assets' and app.is_admin() )
  with check ( bucket_id = 'public-assets' and app.is_admin() );

drop policy if exists public_assets_admin_delete on storage.objects;
create policy public_assets_admin_delete on storage.objects for delete
  to authenticated
  using ( bucket_id = 'public-assets' and app.is_admin() );

-- =====================================================================
-- SON: 0002_storage_buckets.sql tamamlandi.
--   Not: Bucket object versioning kapali/immutable tutulur; foto kaniti degismezligi
--        SHA-256 + sunucu timestamp + append-only DB ile uclu savunmadir (02-veri §3.5).
-- =====================================================================
