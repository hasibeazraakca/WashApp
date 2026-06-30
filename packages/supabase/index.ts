/**
 * @washapp/supabase — Supabase-js client (mobil app).
 *
 * docs/03-yazilim-mimarisi.md §2.4 / §5.1:
 *   - SADECE OKUMA: Auth + RLS-korumali app.* okuma + Realtime + Storage signed URL.
 *   - YAZMA backend'e gider: durum gecisi, para, kanit INSERT -> FastAPI (@washapp/api-client).
 *   - money.* / audit.* semalari mobile RLS ile KAPALI (docs/02 §2.1) — buradan ASLA okunmaz.
 *
 * Anon key istemcide gomulur (sir degil); service_role ASLA istemcide olmaz.
 */

import {
  createClient,
  type SupabaseClient,
  type Session,
} from "@supabase/supabase-js";
import { ENV_KEYS } from "@washapp/config";
import type { OrderStatus, UUID } from "@washapp/types";

export interface SupabaseEnv {
  url: string; // EXPO_PUBLIC_SUPABASE_URL
  anonKey: string; // EXPO_PUBLIC_SUPABASE_ANON_KEY
}

/** Env'den (Expo extra / process.env) Supabase config'i oku. */
export function readSupabaseEnv(
  source: Record<string, string | undefined> = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {},
): SupabaseEnv {
  const url = source[ENV_KEYS.SUPABASE_URL];
  const anonKey = source[ENV_KEYS.SUPABASE_ANON_KEY];
  if (!url || !anonKey) {
    throw new Error(
      `Supabase env eksik: ${ENV_KEYS.SUPABASE_URL} ve ${ENV_KEYS.SUPABASE_ANON_KEY} tanimli olmali.`,
    );
  }
  return { url, anonKey };
}

let _client: SupabaseClient | null = null;

/**
 * Singleton Supabase client.
 * NOT: RN'de auth storage (AsyncStorage) ve detectSessionInUrl=false app tarafinda
 * geciirilmeli — bu paket platform-agnostik kaldigi icin opsiyonel auth opts alir.
 */
export function getSupabase(
  env?: SupabaseEnv,
  authStorage?: {
    getItem: (k: string) => Promise<string | null>;
    setItem: (k: string, v: string) => Promise<void>;
    removeItem: (k: string) => Promise<void>;
  },
): SupabaseClient {
  if (_client) return _client;
  const resolved = env ?? readSupabaseEnv();
  _client = createClient(resolved.url, resolved.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // RN: URL session yok
      ...(authStorage ? { storage: authStorage } : {}),
    },
  });
  return _client;
}

/** Aktif oturum JWT'sini ver (api-client.getAccessToken icin koprulenir). */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}

export type { Session };

// ---------------------------------------------------------------------------
// OKUMA yardimcilari (RLS zaten "kendi verisi" filtreler — docs/02 §2)
// ---------------------------------------------------------------------------

/** Kullanicinin siparis listesi (RLS: musteri/HV kendi satirlari). SADECE OKUMA. */
export async function listMyOrders() {
  // schema('app') — domain semasi; money/audit ASLA buradan sorgulanmaz.
  return getSupabase().schema("app").from("orders").select("*").order("created_at", {
    ascending: false,
  });
}

// ---------------------------------------------------------------------------
// REALTIME (docs/03 §5.2) — siparis durumu / HV konumu / dispatch atama
// ---------------------------------------------------------------------------

/** Siparis durum degisimini canli dinle (postgres_changes, RLS-filtreli). */
export function subscribeOrderStatus(
  orderId: UUID,
  onChange: (status: OrderStatus) => void,
) {
  const channel = getSupabase()
    .channel(`order:${orderId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "app", table: "orders", filter: `id=eq.${orderId}` },
      (payload) => {
        const next = (payload.new as { status?: OrderStatus }).status;
        if (next) onChange(next);
      },
    )
    .subscribe();
  return () => {
    void getSupabase().removeChannel(channel);
  };
}

// TODO(Faz-1): subscribeProviderLocation (broadcast/presence — efemeral, DB'ye yazmaz, docs/03 §5.2)

// ---------------------------------------------------------------------------
// STORAGE — 60 sn imzali URL (docs/02 §3.5). Kalici public URL ASLA.
// ---------------------------------------------------------------------------

/**
 * Kanit fotografi goruntuleme URL'i.
 * NOT: Yetki kontrolu + signed URL uretimi backend'de yapilir (docs/03 §7.4).
 * Bu yardimci yalnizca BACKEND'in dondurdugu signed URL'i tasimak/cache icin yer tutucu.
 * Istemci dogrudan createSignedUrl cagirmaz — yetki sunucuda zorlanir.
 */
export async function fetchEvidenceSignedUrl(): Promise<never> {
  throw new Error(
    "Kanit URL'i backend'den alinir: GET /evidence/... (FastAPI 60 sn signed URL). " +
      "Istemci dogrudan Storage signed URL uretmez (docs/03 §7.4).",
  );
}
