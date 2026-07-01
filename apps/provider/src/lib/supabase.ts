/**
 * Musteri app — Supabase client (RN).
 * Sadece OKUMA + Auth (docs/03 §2.4). Yazma/para/durum -> FastAPI (@washapp/api-client).
 * Oturum bellek-ici tutulur (Expo Go uyumu; AsyncStorage native bagimliligi yok).
 * Kalici oturum icin Faz-2'de @react-native-async-storage eklenir.
 */
import { getSupabase } from "@washapp/supabase";

const _mem = new Map<string, string>();
const memoryStorage = {
  getItem: async (k: string) => _mem.get(k) ?? null,
  setItem: async (k: string, v: string) => {
    _mem.set(k, v);
  },
  removeItem: async (k: string) => {
    _mem.delete(k);
  },
};

export const supabase = getSupabase(
  {
    url: process.env.EXPO_PUBLIC_SUPABASE_URL as string,
    anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string,
  },
  memoryStorage,
);
