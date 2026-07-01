/**
 * @washapp/api-client — FastAPI backend'e fetch wrapper iskeleti.
 *
 * docs/03-yazilim-mimarisi.md §2.4 (HIBRIT model) + §6 (API tablosu).
 * ALTIN KURAL: Yazma + para + durum gecisi + is kurali HER ZAMAN bu client uzerinden
 * FastAPI'ye gider. Mobil app money/audit semalarina veya dogrudan durum yazmasi YAPMAZ.
 *
 * OpenAPI codegen yer tutucu: backend OpenAPI semasi
 * `packages/types/src/generated/openapi.ts`'e dokuldukten sonra request/response
 * tipleri oradan baglanir. Su an elde tutulan @washapp/types DTO'lari kullaniliyor.
 */

import type {
  ApiError,
  Campaign,
  CreateOrderRequest,
  CreateOrderResponse,
  EvidenceUploadUrlRequest,
  EvidenceUploadUrlResponse,
  MediaItem,
  Order,
  OrderJob,
  Profile,
  ServiceRequest,
  ServiceRequestCreate,
  ServiceRequestDetail,
  UUID,
} from "@washapp/types";

export interface ApiClientConfig {
  /** EXPO_PUBLIC_API_BASE_URL — orn. https://washapp-api.onrender.com */
  baseUrl: string;
  /** Supabase JWT saglayici (her istekte Authorization: Bearer). */
  getAccessToken: () => Promise<string | null> | string | null;
  /** Opsiyonel fetch override (test/SSR icin). */
  fetchImpl?: typeof fetch;
}

/** Hata zarfini tasiyan typed exception. */
export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiError,
  ) {
    super(`[${status}] ${body.error}: ${body.detay}`);
    this.name = "ApiRequestError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Mutasyon endpoint'lerinde cift islem onleme (docs/03 §7.5). */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export class WashAppApiClient {
  private readonly baseUrl: string;
  private readonly getAccessToken: ApiClientConfig["getAccessToken"];
  private readonly fetchImpl: typeof fetch;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.getAccessToken = config.getAccessToken;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const token = await this.getAccessToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

    const res = await this.fetchImpl(`${this.baseUrl}/api/v1${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });

    if (res.status === 204) return undefined as T;

    const data = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      const err: ApiError =
        data && typeof data === "object" && "error" in data
          ? (data as ApiError)
          : { error: "unknown", detay: `HTTP ${res.status}` };
      throw new ApiRequestError(res.status, err);
    }
    return data as T;
  }

  // -------------------------------------------------------------------------
  // Kimlik (docs/03 §7.1 — JWT'den tembel profil saglama)
  // -------------------------------------------------------------------------

  /** GET /me — dogrulanmis kullanicinin profili (yoksa JWT'den olusur). */
  me(): Promise<Profile> {
    return this.request("/me");
  }

  /** PATCH /me — ad/telefon/KVKK onayi guncelle. */
  updateMe(body: { ad_soyad?: string; telefon?: string; kvkk_onay?: boolean }): Promise<Profile> {
    return this.request("/me", { method: "PATCH", body });
  }

  // -------------------------------------------------------------------------
  // Siparis (docs/03 §6.1)
  // -------------------------------------------------------------------------

  /** POST /orders — geofence + fiyat snapshot + escrow provizyon (backend). */
  createOrder(body: CreateOrderRequest, idempotencyKey?: string): Promise<CreateOrderResponse> {
    return this.request("/orders", { method: "POST", body, idempotencyKey });
  }

  /** GET /orders/{id} — detay. Agir LISTELEME Supabase RLS'ten okunur (bu client degil). */
  getOrder(id: UUID): Promise<Order> {
    return this.request(`/orders/${id}`);
  }

  /** POST /orders/{id}/arrive — "Vardim" (geofence dogrula -> varildi). */
  arrive(id: UUID): Promise<Order> {
    return this.request(`/orders/${id}/arrive`, { method: "POST" });
  }

  /** POST /orders/{id}/start-wash — oncesi_foto_ok -> yikama. */
  startWash(id: UUID): Promise<Order> {
    return this.request(`/orders/${id}/start-wash`, { method: "POST" });
  }

  /** POST /orders/{id}/confirm — musteri onayi -> capture -> tamamlandi. */
  confirmOrder(id: UUID, idempotencyKey?: string): Promise<Order> {
    return this.request(`/orders/${id}/confirm`, { method: "POST", idempotencyKey });
  }

  /** POST /orders/{id}/dispute — itiraz ac (capture durur). */
  openDispute(id: UUID, sebep: string, aciklama?: string): Promise<Order> {
    return this.request(`/orders/${id}/dispute`, {
      method: "POST",
      body: { sebep, aciklama },
    });
  }

  // -------------------------------------------------------------------------
  // Kanit yukleme (docs/03 §3.4)
  // -------------------------------------------------------------------------

  /** POST /evidence/upload-url — imzali yukleme URL'i al. */
  getEvidenceUploadUrl(
    body: EvidenceUploadUrlRequest,
  ): Promise<EvidenceUploadUrlResponse> {
    return this.request("/evidence/upload-url", { method: "POST", body });
  }

  /** POST /evidence/confirm — sunucu re-hash dogrula + INSERT. gps+cihaz_ts zorunlu. */
  confirmEvidence(body: {
    order_id: UUID;
    evre: string;
    aci: string;
    sha256: string;
    gps: { lat: number; lon: number; accuracy_m?: number };
    cihaz_ts: string;
  }): Promise<{
    accepted: boolean;
    evre: string;
    aci: string;
    remaining: string[];
    status: string | null;
  }> {
    return this.request("/evidence/confirm", { method: "POST", body });
  }

  // -------------------------------------------------------------------------
  // Cuzdan (docs/03 §6.1 — money'den ozet, sadece okuma backend uzerinden)
  // -------------------------------------------------------------------------

  /** GET /wallet — hizmet veren cuzdan bakiyesi (money mobile kapali, backend ozetler). */
  getWallet(): Promise<{ bakiye: number; para_birimi: string }> {
    return this.request("/wallet");
  }

  // -------------------------------------------------------------------------
  // Kampanyalar (reklam/sponsor banner — ana ekran)
  // -------------------------------------------------------------------------

  /** GET /campaigns — aktif kampanyalar. Mobil bunu Supabase RLS'ten de okuyabilir. */
  listCampaigns(): Promise<Campaign[]> {
    return this.request("/campaigns");
  }

  /** POST /campaigns/{id}/click — tiklama takibi (sayac backend'de artar). */
  trackCampaignClick(id: UUID): Promise<{ kampanya_id: UUID; tiklama_sayisi: number }> {
    return this.request(`/campaigns/${id}/click`, { method: "POST" });
  }

  // -------------------------------------------------------------------------
  // Hizmet katalogu — randevu talebi (yikama disi: yag/lastik/bakim)
  // Katalog LISTELEME mobil tarafinda Supabase RLS'ten okunur (bu client degil).
  // -------------------------------------------------------------------------

  /** POST /services/requests — randevu_modu hizmet talebi olustur (fotosuz akis). */
  createServiceRequest(body: ServiceRequestCreate, idempotencyKey?: string): Promise<ServiceRequest> {
    return this.request("/services/requests", { method: "POST", body, idempotencyKey });
  }

  // -------------------------------------------------------------------------
  // PROVIDER (hizmet veren) is akisi — havuz / ustlen / fiyat / durum / medya
  // -------------------------------------------------------------------------

  /** GET /orders/open — atanmamis siparis havuzu (yikama). */
  listOpenOrders(): Promise<OrderJob[]> {
    return this.request("/orders/open");
  }

  /** GET /orders/mine — bana atanmis aktif siparisler. */
  listMyJobs(): Promise<OrderJob[]> {
    return this.request("/orders/mine");
  }

  /** POST /orders/{id}/claim — siparisi self-ustlen (olusturuldu -> eslestirildi). */
  claimOrder(id: UUID): Promise<{ order_id: UUID; status: string }> {
    return this.request(`/orders/${id}/claim`, { method: "POST" });
  }

  /** GET /services/requests/open — acik randevu talepleri havuzu. */
  listOpenRequests(): Promise<ServiceRequestDetail[]> {
    return this.request("/services/requests/open");
  }

  /** GET /services/requests/mine — ustlendigim talepler. */
  listMyRequests(): Promise<ServiceRequestDetail[]> {
    return this.request("/services/requests/mine");
  }

  /** GET /services/requests/{id} — talep detay. */
  getRequest(id: UUID): Promise<ServiceRequestDetail> {
    return this.request(`/services/requests/${id}`);
  }

  /** POST /services/requests/{id}/claim — talebi ustlen. */
  claimRequest(id: UUID): Promise<ServiceRequestDetail> {
    return this.request(`/services/requests/${id}/claim`, { method: "POST" });
  }

  /** POST /services/requests/{id}/quote — fiyat ver. */
  quoteRequest(id: UUID, fiyat: number): Promise<ServiceRequestDetail> {
    return this.request(`/services/requests/${id}/quote`, { method: "POST", body: { fiyat } });
  }

  /** POST /services/requests/{id}/status — durum ilerlet. */
  updateRequestStatus(id: UUID, durum: string): Promise<ServiceRequestDetail> {
    return this.request(`/services/requests/${id}/status`, { method: "POST", body: { durum } });
  }

  /** POST /services/requests/{id}/media/upload-url — talep fotosu imzali yukleme URL'i. */
  requestMediaUploadUrl(id: UUID): Promise<{ upload_url: string; storage_path: string; expires_in: number }> {
    return this.request(`/services/requests/${id}/media/upload-url`, { method: "POST" });
  }

  /** POST /services/requests/{id}/media — yuklenen fotoyu kaydet. */
  addRequestMedia(id: UUID, body: { storage_path: string; asama?: string; aciklama?: string }): Promise<MediaItem> {
    return this.request(`/services/requests/${id}/media`, { method: "POST", body });
  }

  /** GET /services/requests/{id}/media — talep medyasi (imzali URL'ler). */
  listRequestMedia(id: UUID): Promise<MediaItem[]> {
    return this.request(`/services/requests/${id}/media`);
  }

  // TODO(Faz-3): disputes/resolve, dispatch/candidates, dispatch/assign,
  // subscriptions, providers/onboarding endpoint sarmalayicilari.
}

/** Fabrika — app'ler bunu Supabase oturum tokeni ile baglar. */
export function createApiClient(config: ApiClientConfig): WashAppApiClient {
  return new WashAppApiClient(config);
}

// NOTE(codegen): TanStack Query hook'lari (useCreateOrder, useOrder, ...) bu client
// uzerine kurulacak. OpenAPI tipleri geldikten sonra eklenir (docs/03 §1.2/§1.3).
