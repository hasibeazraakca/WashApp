-- =====================================================================
-- WashApp — 0005_expose_and_grants.sql
-- Mobil okuma yolunu (Supabase RLS, altin kural) CALISIR hale getir.
--
-- SORUN: PostgREST yalniz 'public, graphql_public' semalarini expose ediyordu ->
--   mobilin supabase.schema('app') okumalari PGRST106 (Invalid schema) veriyordu.
--   Ayrica app tablolarinda RLS politikasi vardi ama authenticated'a tablo GRANT'i
--   YOKTU -> expose sonrasi 42501 (permission denied). RLS + GRANT ikisi de sart.
--
-- COZUM:
--   1) 'app' semasini PostgREST'e expose et (money/audit ASLA expose edilmez).
--   2) Mobilin dokundugu app tablolarina asgari GRANT (RLS zaten satiri kisitlar).
--
-- NOT: Supabase Dashboard > Settings > API > Exposed schemas listesine de 'app'
--   eklenmeli (kalicilik icin). Bu migration ayni GUC'u role uzerinden yazar.
-- Idempotent: ALTER ROLE SET + GRANT tekrar guvenli.
-- =====================================================================

-- 1) app semasini expose et (mevcut public/graphql_public korunur)
alter role authenticator set pgrst.db_schemas to 'public, graphql_public, app';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';

-- 2) Mobilin okudugu/yazdigi app tablolarina GRANT (satir kisiti RLS'te)
--    plazalar: herkes okur (plazalar_read using true)
grant select on app.plazalar to anon, authenticated;

--    araclar: musteri kendi araclarini okur + ekler (araclar_self with check)
grant select, insert on app.araclar to authenticated;

--    orders: musteri kendi siparislerini okur (orders_musteri_select)
grant select on app.orders to authenticated;

--    profiller: mobil /me'yi backend'den alir; yine de kendi profilini okuyabilsin
grant select on app.profiles to authenticated;

-- =====================================================================
-- SON: 0005_expose_and_grants.sql tamamlandi.
-- =====================================================================
