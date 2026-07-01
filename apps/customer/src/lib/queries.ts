/**
 * Supabase OKUMA yardimcilari (RLS "kendi verisi" filtreler — docs/02 §2).
 * Plaza/arac listeleme ve arac ekleme dogrudan Supabase (app semasi); siparis
 * OLUSTURMA yine FastAPI'den gider (altin kural).
 */
import type { Campaign, Order, Plaza, Service, ServiceCategory, ServiceRequest, Vehicle } from "@washapp/types";
import { supabase } from "./supabase";

export async function listPlazalar(): Promise<Plaza[]> {
  const { data, error } = await supabase.schema("app").from("plazalar").select("id, ad").order("ad");
  if (error) throw new Error(error.message);
  return (data ?? []) as Plaza[];
}

export async function listMyVehicles(): Promise<Vehicle[]> {
  const { data, error } = await supabase
    .schema("app")
    .from("araclar")
    .select("id, plaka, marka, model, arac_tipi, musteri_id")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Vehicle[];
}

export async function addVehicle(input: {
  musteri_id: string;
  plaka: string;
  arac_tipi: string;
  marka?: string;
}): Promise<Vehicle> {
  const { data, error } = await supabase
    .schema("app")
    .from("araclar")
    .insert({
      musteri_id: input.musteri_id,
      plaka: input.plaka.toUpperCase().replace(/\s+/g, ""),
      arac_tipi: input.arac_tipi,
      marka: input.marka,
    })
    .select("id, plaka, marka, model, arac_tipi, musteri_id")
    .single();
  if (error) throw new Error(error.message);
  return data as Vehicle;
}

export async function listServiceCategories(): Promise<ServiceCategory[]> {
  const { data, error } = await supabase
    .schema("app")
    .from("hizmet_kategorileri")
    .select("id, kod, ad, ikon, sira, aktif")
    .eq("aktif", true)
    .order("sira", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ServiceCategory[];
}

export async function listServices(): Promise<Service[]> {
  const { data, error } = await supabase
    .schema("app")
    .from("hizmetler")
    .select("id, kategori_id, kod, ad, aciklama, taban_fiyat, sure_dk, ikon, foto_kanit_gerekli, randevu_modu, suv_ek, sira, aktif")
    .eq("aktif", true)
    .order("sira", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Service[];
}

export async function listMyServiceRequests(): Promise<ServiceRequest[]> {
  const { data, error } = await supabase
    .schema("app")
    .from("hizmet_talepleri")
    .select("id, hizmet_id, arac_id, durum, tahmini_fiyat, tercih_zaman, created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ServiceRequest[];
}

export async function listCampaigns(): Promise<Campaign[]> {
  // RLS yalniz aktif + tarih penceresindeki kampanyalari dondurur (0003_campaigns.sql).
  const { data, error } = await supabase
    .schema("app")
    .from("kampanyalar")
    .select("id, baslik, aciklama, gorsel_url, hizmet_veren_id, sponsor_ad, hedef_url, aktif, siralama, tiklama_sayisi, created_at")
    .order("siralama", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Campaign[];
}

export async function listMyOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .schema("app")
    .from("orders")
    .select("id, paket, status, gmv, koruma_fonu, created_at, plaza_id, arac_id")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Order[];
}
