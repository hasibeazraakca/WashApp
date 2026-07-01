-- =====================================================================
-- WashApp — 0007_provider_flow.sql
-- Hizmet veren (provider) is akisi: talebi ustlenme + fiyat verme + durum + medya.
--
--   * app.hizmet_talepleri: hizmet_veren_id (ustlenen) + fiyat_teklifi (verilen fiyat).
--     durum akisi (backend zorlar): yeni -> uslenildi -> teklif_verildi -> planlandi
--                                        -> yolda -> tamamlandi | iptal
--   * app.talep_medya: talebe her asamada eklenen ilerleme fotolari (serbest; yikama
--     6-aci kaniti DEGIL — o app.photo_evidence'ta kalir).
--
-- Siparis (yikama) self-claim SEMA gerektirmez: orders.hizmet_veren_id zaten var,
-- backend POST /orders/{id}/claim ile 'olusturuldu'->'eslestirildi' yapar.
--
-- Altin kural: acik talep listesi + yazma FastAPI (service_role). Provider kendi
-- ustlendigi talepleri Supabase RLS'ten de okur (asagidaki policy).
-- Idempotent.
-- =====================================================================

-- 1) Talebe ustlenen + fiyat teklifi
alter table app.hizmet_talepleri
  add column if not exists hizmet_veren_id uuid references app.profiles(id),
  add column if not exists fiyat_teklifi   numeric(10,2);
create index if not exists idx_talep_hv on app.hizmet_talepleri(hizmet_veren_id, created_at desc);

-- 2) Talep ilerleme medyasi (serbest foto — yikama kaniti degil)
create table if not exists app.talep_medya (
  id              uuid primary key default gen_random_uuid(),
  talep_id        uuid not null references app.hizmet_talepleri(id) on delete cascade,
  hizmet_veren_id uuid not null references app.profiles(id),
  storage_path    text not null,          -- evidence bucket 'talep/{talep_id}/{uuid}.jpg'
  asama           text,                    -- hangi durumda cekildi (uslenildi/yolda/tamamlandi)
  aciklama        text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_talep_medya_talep on app.talep_medya(talep_id, created_at);

-- 3) RLS
alter table app.talep_medya enable row level security;

-- Talepler: mevcut talep_self_select (musteri/staff) + ustlenen provider da okur.
drop policy if exists talep_hv_select on app.hizmet_talepleri;
create policy talep_hv_select on app.hizmet_talepleri for select
  using ( hizmet_veren_id = auth.uid() );

-- Talep medyasi: talebin taraflari (musteri/ustlenen HV) + staff okur.
drop policy if exists talep_medya_select on app.talep_medya;
create policy talep_medya_select on app.talep_medya for select
  using (
    app.is_staff()
    or hizmet_veren_id = auth.uid()
    or exists (select 1 from app.hizmet_talepleri t
               where t.id = talep_id and t.musteri_id = auth.uid())
  );
grant select on app.talep_medya to authenticated;
-- INSERT grant YOK -> medya yalniz backend (service_role) uzerinden yazilir.

-- =====================================================================
-- SON: 0007_provider_flow.sql tamamlandi.
-- =====================================================================
