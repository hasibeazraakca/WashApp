-- =====================================================================
-- WashApp — 0006_rls_ref_grants.sql
-- RLS politika-zinciri GRANT'lari.
--
-- SORUN: app.orders / app.araclar SELECT'i 42501 veriyordu. Neden: RLS politika
--   ifadeleri baska tablolara subquery yapiyor ve Postgres bu subquery'leri
--   CAGIRAN rolun (authenticated) haklariyla degerlendirir:
--     * orders_plaza_select  -> app.b2b_uyelikler okur
--     * araclar_hv_select    -> app.orders okur (-> o da b2b_uyelikler'e zincirlenir)
--   Referans tabloda SELECT grant'i yoksa politika degerlendirmesi patlar (42501).
--
-- COZUM: Zincirdeki referans tabloya asgari SELECT ver. Satir gizliligi korunur:
--   b2b_uyelikler'in kendi RLS'i (yonetici/profile/staff) satiri kisitlamaya devam eder.
-- Idempotent.
-- =====================================================================

grant select on app.b2b_uyelikler to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- SON: 0006_rls_ref_grants.sql tamamlandi.
-- =====================================================================
