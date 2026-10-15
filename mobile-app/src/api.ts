import AsyncStorage from "@react-native-async-storage/async-storage";

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "https://syncroway-backend.onrender.com/api";

export type CatalogItem = {
  id: string | number;
  name: string;
  title?: string;
  description?: string;
  price?: number | string;
  image_url?: string | null;
  image?: string | null;
  category?: string;
  store_name?: string;
  store?: { name?: string };
  type?: "product" | "service";
  available?: boolean;
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await AsyncStorage.getItem("syncroway_token");
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  const raw = await response.text();
  let data: any = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw }; }

  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Falha na API (${response.status})`);
  }
  return data as T;
}

function extractItems(payload: any): CatalogItem[] {
  if (Array.isArray(payload)) return payload;
  for (const key of ["items", "products", "services", "results", "data"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
    if (Array.isArray(payload?.[key]?.items)) return payload[key].items;
  }
  return [];
}

export async function getCatalog(type: "product" | "service" = "product"): Promise<CatalogItem[]> {
  const candidates = type === "product"
    ? ["/products", "/catalog?type=product", "/catalog", "/items"]
    : ["/services", "/catalog?type=service"];

  let lastError: unknown;
  for (const path of candidates) {
    try {
      const payload = await request<any>(path);
      const items = extractItems(payload);
      return items.map((item, index) => ({
        ...item,
        id: item.id ?? item.product_id ?? item.service_id ?? `${type}-${index}`,
        name: item.name ?? item.title ?? item.product_name ?? item.service_name ?? "Item do SyncroWay",
        type,
      }));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Não foi possível carregar o catálogo.");
}

export async function checkApi(): Promise<boolean> {
  try {
    await request("/health");
    return true;
  } catch {
    return false;
  }
}

export async function saveToken(token: string | null) {
  if (token) await AsyncStorage.setItem("syncroway_token", token);
  else await AsyncStorage.removeItem("syncroway_token");
}
