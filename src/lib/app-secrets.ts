// The API keys of other services: the encrypted copy in public.app_secrets (edited in Cài đặt → Khóa API) wins, the server's .env is the fallback.
// Server only. No "@/" imports: used by files tested with plain Node (without Supabase settings there it is just the environment).
import { createClient } from "@supabase/supabase-js";
import { decryptSecret, encryptSecret } from "./grab-credentials.ts";

export type SecretKey = { name: string; label: string; note: string };
export const SECRET_KEYS: SecretKey[] = [
  { name: "ZENROWS_API_KEY", label: "ZenRows", note: "Tripadvisor, Expedia, Trip.com" },
  { name: "APIFY_API_TOKEN", label: "Apify", note: "Agoda, Traveloka" },
  { name: "BLUEJAY_API_KEY", label: "Blue Jay", note: "Vận hành khách sạn" },
  { name: "API_WINDSOR", label: "Windsor (tài khoản 1)", note: "Maps, Analytics, TikTok, quảng cáo" },
  { name: "API_WINDSOR_2", label: "Windsor (tài khoản 2)", note: "Facebook, Instagram" },
  { name: "GOOGLE_SERVICE_ACCOUNT_JSON", label: "Google Sheet", note: "JSON tài khoản dịch vụ: thu chi, kho, nhân sự" },
  { name: "HR_APPS_SCRIPT_URL", label: "Apps Script · địa chỉ", note: "Ứng dụng web nhân sự và tuyển dụng" },
  { name: "HR_APPS_SCRIPT_TOKEN", label: "Apps Script · mã truy cập", note: "Mã của ứng dụng web nhân sự và tuyển dụng" },
];

const TTL_MS = 60_000;
let cache: { at: number; values: Map<string, string> } | null = null;

export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

/** The stored values, decrypted, kept a minute. A missing table, no Supabase settings or a value that does not decrypt (the key changed) just leaves that name to the .env. */
async function stored() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.values;
  const values = new Map<string, string>();
  try {
    const { data } = (await serviceClient()?.from("app_secrets").select("name,value_encrypted")) ?? { data: null };
    for (const row of data ?? []) { try { values.set(row.name, decryptSecret(row.value_encrypted)); } catch { /* left to the .env */ } }
  } catch { /* left to the .env */ }
  cache = { at: Date.now(), values };
  return values;
}

export const clearSecretCache = () => { cache = null; };

/** The value of a key: the stored one, else the environment's; "" when neither is set. */
export async function secret(name: string) {
  return ((await stored()).get(name) ?? process.env[name] ?? "").trim();
}

/** For Cài đặt: whether each key is set, where from, and the last 4 characters of a one-line value. Never the value. */
export async function listSecrets() {
  const db = serviceClient();
  const { data, error } = (await db?.from("app_secrets").select("name,updated_at")) ?? { data: null, error: { message: "Thiếu SUPABASE_SERVICE_ROLE_KEY trên máy chủ." } };
  const updated = new Map((data ?? []).map((r) => [r.name as string, r.updated_at as string]));
  const values = await stored();
  return {
    tableReady: !error,
    keys: SECRET_KEYS.map((k) => {
      const value = values.get(k.name), env = (process.env[k.name] ?? "").trim();
      const shown = value ?? env;
      return { ...k, source: value ? "database" : env ? "env" : "none", tail: shown ? shown.slice(-4) : "", updatedAt: updated.get(k.name) ?? null };
    }),
  };
}

export async function saveSecret(name: string, value: string, userId: string | null) {
  const db = serviceClient();
  if (!db) throw new Error("Thiếu SUPABASE_SERVICE_ROLE_KEY trên máy chủ.");
  const { error } = await db.from("app_secrets").upsert({ name, value_encrypted: encryptSecret(value), updated_at: new Date().toISOString(), updated_by: userId });
  if (error) throw new Error(error.message);
  clearSecretCache();
}

export async function removeSecret(name: string) {
  const db = serviceClient();
  if (!db) throw new Error("Thiếu SUPABASE_SERVICE_ROLE_KEY trên máy chủ.");
  const { error } = await db.from("app_secrets").delete().eq("name", name);
  if (error) throw new Error(error.message);
  clearSecretCache();
}
