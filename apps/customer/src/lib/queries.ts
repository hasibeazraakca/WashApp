/**
 * Supabase OKUMA yardimcilari (RLS "kendi verisi" filtreler — docs/02 §2).
 * Plaza/arac listeleme ve arac ekleme dogrudan Supabase (app semasi); siparis
 * OLUSTURMA yine FastAPI'den gider (altin kural).
 */
import type { Order, Plaza, Vehicle } from "@washapp/types";
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
