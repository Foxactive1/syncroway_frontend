/* ═══════════════════════════════════════════════════════════════
   SyncroWay — api.js
   Client HTTP + sessão + endpoints.

   Correções em relação à versão anterior:
   • refreshSession só limpa sessão em 401/403 (5xx/timeout/
     HTML de proxy não deslogam mais o usuário)
   • refreshSession protege response.json() e valida access_token
     antes de salvar — evita gravar { } e entrar em loop 401
   • session.set/get/clear com try/catch + fallback em memória
     (Safari privado / iframe sandbox / quota cheia)
   • api.product(id) e api.service(id) adicionados — produto.js
     para de baixar o catálogo inteiro por detalhe
   • api.logout com retry: false — evita rotacionar refresh_token
     e enviar o antigo no body
   ═══════════════════════════════════════════════════════════════ */

import { API_BASE } from "./config.js";

const STORE_KEY = "syncroway_session";
const REQUEST_TIMEOUT_MS = 60000;

// ═══════════════════════════════════════════════════════════
// Sessão
// ═══════════════════════════════════════════════════════════

/**
 * Fallback em memória: se localStorage estiver bloqueado
 * (Safari privado, iframe sandbox, quota cheia), o app continua
 * funcionando na sessão atual — só não persiste entre reloads.
 */
let memorySession = null;

function readStoredSession() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw !== null) return JSON.parse(raw) || null;
  } catch {
    // JSON inválido ou storage bloqueado — cai no memorySession.
  }
  return memorySession;
}

export const session = {
  get() {
    return readStoredSession();
  },
  set(data) {
    memorySession = data;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
    } catch {
      // Storage bloqueado. Sessão vive só em memória até o reload.
    }
  },
  clear() {
    memorySession = null;
    try {
      localStorage.removeItem(STORE_KEY);
    } catch {
      // Nada a fazer: memorySession já foi limpo.
    }
  },
  get user() {
    return this.get()?.user || null;
  },
  get role() {
    return this.get()?.user?.role || null;
  },
  get isCustomer() {
    return this.role === "customer";
  },
  get isMerchant() {
    return this.role === "merchant";
  },
  get isProvider() {
    return this.role === "provider";
  },
  get isDriver() {
    return this.role === "driver";
  },
  get isAdmin() {
    return this.role === "admin";
  },
};

// ═══════════════════════════════════════════════════════════
// Erro tipado
// ═══════════════════════════════════════════════════════════

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// ═══════════════════════════════════════════════════════════
// Parse de resposta
// ═══════════════════════════════════════════════════════════

async function parse(response) {
  const text = await response.text();

  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Não é JSON (HTML de erro, texto puro). Empacota cru.
    data = { error: text };
  }

  if (!response.ok) {
    throw new ApiError(
      data?.error || `Falha na requisição (${response.status})`,
      response.status
    );
  }

  return data;
}

// ═══════════════════════════════════════════════════════════
// Fetch com timeout
// ═══════════════════════════════════════════════════════════

/**
 * fetch com timeout via AbortController.
 * Se o navegador não suportar, cai para fetch puro (sem cancelamento).
 */
function fetchWithTimeout(url, options = {}) {
  if (typeof AbortController === "undefined") {
    return fetch(url, options);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

// ═══════════════════════════════════════════════════════════
// Refresh de sessão (single-flight)
// ═══════════════════════════════════════════════════════════

/**
 * Single-flight: chamadas 401 concorrentes compartilham o mesmo refresh.
 * Sem isso, N requests em paralelo revogam N-1 tokens e deslogam o usuário.
 */
let refreshPromise = null;

async function refreshSession() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const current = session.get();
    if (!current?.refresh_token) return false;

    let response;
    try {
      response = await fetchWithTimeout(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ refresh_token: current.refresh_token }),
      });
    } catch {
      // Timeout, rede caída — preserva sessão, próximo request tenta.
      return false;
    }

    if (!response.ok) {
      // 401/403 = credenciais inválidas, limpa de vez.
      // 5xx/429/4xx diverso = erro transitório, PRESERVA sessão
      // para não deslogar em deploy/pico/restart.
      if ([401, 403].includes(response.status)) {
        session.clear();
      }
      return false;
    }

    // Response 2xx pode não ser JSON (proxy, WAF, página de
    // manutenção com 200). Não deixa isso virar exceção crua.
    let tokens;
    try {
      tokens = await response.json();
    } catch {
      return false;
    }

    // Backend retornou 200 sem token? Não grava objeto vazio —
    // evita loop 401 → refresh(ok vazio) → 401.
    if (!tokens || typeof tokens !== "object" || !tokens.access_token) {
      return false;
    }

    session.set({ ...current, ...tokens });
    return true;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

// ═══════════════════════════════════════════════════════════
// Request genérico
// ═══════════════════════════════════════════════════════════

export async function request(
  path,
  { method = "GET", body, auth = false, retry = true } = {}
) {
  const headers = { Accept: "application/json" };

  if (body !== undefined) headers["Content-Type"] = "application/json";

  const token = session.get()?.access_token;
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetchWithTimeout(`${API_BASE}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    const message =
      error?.name === "AbortError"
        ? "A API demorou demais para responder. Tente novamente."
        : "Não foi possível falar com a API SyncroWay. " +
          "Verifique se ela está online e liberada para este endereço.";
    throw new ApiError(message, 0);
  }

  if (
    response.status === 401 &&
    auth &&
    retry &&
    (await refreshSession())
  ) {
    return request(path, { method, body, auth, retry: false });
  }

  return parse(response);
}

// ═══════════════════════════════════════════════════════════
// Query string helper
// ═══════════════════════════════════════════════════════════

const withQuery = (params = {}) => {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== "" && v != null)
  ).toString();
  return qs ? `?${qs}` : "";
};

// ═══════════════════════════════════════════════════════════
// Endpoints
// ═══════════════════════════════════════════════════════════

export const api = {
  // ─── Infra ────────────────────────────────────────
  health: () => request("/health"),
  publicConfig: () => request("/public-config"),

  // ─── Auth ─────────────────────────────────────────
  login: (email, password) =>
    request("/auth/login", { method: "POST", body: { email, password } }),

  register: (payload) =>
    request("/auth/register", { method: "POST", body: payload }),

  me: () => request("/me", { auth: true }),

  // retry: false — se o access token estiver expirado, não rotaciona
  // o refresh_token (o body ficaria com o token antigo, que o backend
  // já revogou). O caller (ui.js:performLogout) limpa a sessão local
  // mesmo em caso de erro.
  logout: () =>
    request("/auth/logout", {
      method: "POST",
      auth: true,
      retry: false,
      body: { refresh_token: session.get()?.refresh_token },
    }),

  // ─── Catálogo ─────────────────────────────────────
  categories: () => request("/categories"),
  catalog: (params = {}) => request(`/catalog${withQuery(params)}`),
  stores: (params = {}) => request(`/stores${withQuery(params)}`),
  store: (id) => request(`/stores/${id}`),
  products: (params = {}) => request(`/products${withQuery(params)}`),
  product: (id) => request(`/products/${id}`),           // ← NOVO
  services: (params = {}) => request(`/services${withQuery(params)}`),
  service: (id) => request(`/services/${id}`),           // ← NOVO

  // ─── Carrinho / checkout ──────────────────────────
  cart: () => request("/cart", { auth: true }),

  addToCart: (product_id, quantity = 1) =>
    request("/cart/items", {
      method: "POST",
      auth: true,
      body: { product_id, quantity },
    }),

  updateCartItem: (id, quantity) =>
    request(`/cart/items/${id}`, {
      method: "PATCH",
      auth: true,
      body: { quantity },
    }),

  removeCartItem: (id) =>
    request(`/cart/items/${id}`, { method: "DELETE", auth: true }),

  checkout: (payload) =>
    request("/checkout", { method: "POST", auth: true, body: payload }),

  createPayment: (id, cpf_cnpj) =>
    request(`/payments/orders/${id}`, {
      method: "POST",
      auth: true,
      body: { cpf_cnpj },
    }),

  payment: (id) => request(`/payments/orders/${id}`, { auth: true }),
  pix: (id) => request(`/payments/orders/${id}/pix`, { auth: true }),

  cancelOrder: (id) =>
    request(`/orders/${id}/cancel`, { method: "POST", auth: true }),

  orders: () => request("/orders", { auth: true }),
  order: (id) => request(`/orders/${id}`, { auth: true }),

  // ─── Cliente: agendamentos ────────────────────────
  appointments: () => request("/appointments", { auth: true }),

  createAppointment: (payload) =>
    request("/appointments", { method: "POST", auth: true, body: payload }),

  // ─── Merchant ─────────────────────────────────────
  merchantDashboard: (params = {}) =>
    request(`/merchant/dashboard${withQuery(params)}`, { auth: true }),

  merchantCreateStore: (payload) =>
    request("/merchant/stores", { method: "POST", auth: true, body: payload }),

  merchantCreateProduct: (storeId, payload) =>
    request(`/merchant/stores/${storeId}/products`, {
      method: "POST",
      auth: true,
      body: payload,
    }),

  merchantProducts: (params = {}) =>
    request(`/merchant/products${withQuery(params)}`, { auth: true }),

  merchantInventory: (params = {}) =>
    request(`/merchant/inventory${withQuery(params)}`, { auth: true }),

  merchantStockMovements: (params = {}) =>
    request(`/merchant/stock-movements${withQuery(params)}`, { auth: true }),

  merchantCreateMovement: (productId, payload) =>
    request(`/merchant/products/${productId}/movements`, {
      method: "POST",
      auth: true,
      body: payload,
    }),

  merchantInventoryCount: (payload) =>
    request("/merchant/inventory/count", {
      method: "POST",
      auth: true,
      body: payload,
    }),

  merchantInventoryAlerts: (params = {}) =>
    request(`/merchant/inventory/alerts${withQuery(params)}`, { auth: true }),

  merchantUpdateProduct: (id, payload) =>
    request(`/merchant/products/${id}`, {
      method: "PATCH",
      auth: true,
      body: payload,
    }),

  merchantUpdateStock: (id, payload) =>
    request(`/merchant/products/${id}/stock`, {
      method: "PATCH",
      auth: true,
      body: payload,
    }),

  merchantArchiveProduct: (id) =>
    request(`/merchant/products/${id}`, { method: "DELETE", auth: true }),

  merchantCreateService: (storeId, payload) =>
    request(`/merchant/stores/${storeId}/services`, {
      method: "POST",
      auth: true,
      body: payload,
    }),

  merchantAppointments: () =>
    request("/merchant/appointments", { auth: true }),

  merchantUpdateAppointment: (id, status) =>
    request(`/merchant/appointments/${id}`, {
      method: "PATCH",
      auth: true,
      body: { status },
    }),

  // ─── Provider ─────────────────────────────────────
  providerProfile: () => request("/provider/profile", { auth: true }),

  providerUpdateProfile: (payload) =>
    request("/provider/profile", { method: "PATCH", auth: true, body: payload }),

  providerDashboard: () => request("/provider/dashboard", { auth: true }),
  providerServices: () => request("/provider/services", { auth: true }),

  providerCreateService: (payload) =>
    request("/provider/services", { method: "POST", auth: true, body: payload }),

  providerUpdateService: (id, payload) =>
    request(`/provider/services/${id}`, {
      method: "PATCH",
      auth: true,
      body: payload,
    }),

  providerAppointments: () =>
    request("/provider/appointments", { auth: true }),

  providerUpdateAppointment: (id, status) =>
    request(`/provider/appointments/${id}`, {
      method: "PATCH",
      auth: true,
      body: { status },
    }),

  // ─── Driver ───────────────────────────────────────
  driverDashboard: (params = {}) =>
    request(`/driver/dashboard${withQuery(params)}`, { auth: true }),

  driverHistory: (params = {}) =>
    request(`/driver/deliveries/history${withQuery(params)}`, { auth: true }),

  driverSetStatus: (payload) =>
    request("/driver/status", { method: "PATCH", auth: true, body: payload }),

  driverAcceptDelivery: (id) =>
    request(`/driver/deliveries/${id}/accept`, { method: "POST", auth: true }),

  driverUpdateDelivery: (id, status) =>
    request(`/driver/deliveries/${id}`, {
      method: "PATCH",
      auth: true,
      body: { status },
    }),

  // ─── Admin ────────────────────────────────────────
  adminConfirmOfflinePayment: (id, reference) =>
    request(`/admin/orders/${id}/confirm-offline-payment`, {
      method: "POST",
      auth: true,
      body: { reference },
    }),

  adminReconcilePayment: (id, external_id) =>
    request(`/admin/payments/orders/${id}/reconcile`, {
      method: "POST",
      auth: true,
      body: { external_id },
    }),

  adminCancelPayment: (id) =>
    request(`/admin/payments/orders/${id}/cancel`, {
      method: "POST",
      auth: true,
    }),

  adminDashboard: () => request("/admin/dashboard", { auth: true }),

  adminMediaAssets: (params = {}) =>
    request(`/admin/media-assets${withQuery(params)}`, { auth: true }),

  adminCreateMediaAsset: (payload) =>
    request("/admin/media-assets", {
      method: "POST",
      auth: true,
      body: payload,
    }),

  adminUpdateMediaAsset: (id, payload) =>
    request(`/admin/media-assets/${id}`, {
      method: "PATCH",
      auth: true,
      body: payload,
    }),

  adminArchiveMediaAsset: (id) =>
    request(`/admin/media-assets/${id}`, { method: "DELETE", auth: true }),

  adminLinkMediaAssetUsage: (id, payload) =>
    request(`/admin/media-assets/${id}/usages`, {
      method: "POST",
      auth: true,
      body: payload,
    }),

  adminFinance: (params = {}) =>
    request(`/admin/finance${withQuery(params)}`, { auth: true }),

  adminTransactions: (params = {}) =>
    request(`/admin/transactions${withQuery(params)}`, { auth: true }),

  adminSettleTransaction: (id) =>
    request(`/admin/transactions/${id}/settle`, { method: "PATCH", auth: true }),

  adminCreateUser: (payload) =>
    request("/admin/users", { method: "POST", auth: true, body: payload }),

  adminUsers: (params = {}) =>
    request(`/admin/users${withQuery(params)}`, { auth: true }),

  adminCreateDriver: (payload) =>
    request("/admin/drivers", { method: "POST", auth: true, body: payload }),

  adminStores: () => request("/admin/stores", { auth: true }),

  adminUpdateStore: (id, payload) =>
    request(`/admin/stores/${id}`, {
      method: "PATCH",
      auth: true,
      body: payload,
    }),

  adminOrders: (params = {}) =>
    request(`/admin/orders${withQuery(params)}`, { auth: true }),

  adminDeliveries: (params = {}) =>
    request(`/admin/deliveries${withQuery(params)}`, { auth: true }),

  adminDrivers: () => request("/admin/drivers", { auth: true }),

  adminUpdateDriver: (id, payload) =>
    request(`/admin/drivers/${id}`, {
      method: "PATCH",
      auth: true,
      body: payload,
    }),

  adminAssignDelivery: (deliveryId, driverId) =>
    request(`/admin/deliveries/${deliveryId}/assign`, {
      method: "POST",
      auth: true,
      body: { driver_id: driverId },
    }),
};
