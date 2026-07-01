/**
 * Musteri app — FastAPI client (yazma/para/durum otoritesi, docs/03 §2.4).
 * Her istekte Supabase oturum JWT'si Authorization: Bearer olarak gider.
 */
import { createApiClient } from "@washapp/api-client";
import { supabase } from "./supabase";

const API_BASE =
  (process.env.EXPO_PUBLIC_API_BASE_URL as string) || "https://washapp-ekbj.onrender.com";

export const api = createApiClient({
  baseUrl: API_BASE,
  getAccessToken: async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  },
});

export { API_BASE };
