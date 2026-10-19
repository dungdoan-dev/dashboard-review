// One read from Windsor.ai (API_WINDSOR). No "@/" imports: used by files tested with plain Node.
export type WindsorRow = Record<string, string | number | null>;

/** connector: e.g. "google_my_business", "facebook_organic". No select_accounts: every account linked in Windsor comes back. */
export async function windsorRows(connector: string, fields: string[], from: string, to: string): Promise<WindsorRow[]> {
  const key = process.env.API_WINDSOR?.trim();
  if (!key) throw new Error("Chưa cấu hình nguồn số liệu tiếp cận.");
  const res = await fetch(`https://connectors.windsor.ai/${connector}?${new URLSearchParams({ date_from: from, date_to: to, fields: fields.join(","), api_key: key })}`, { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(`Không lấy được số liệu: ${String(body.error ?? res.status).replace(/windsor(\.ai)?/gi, "nguồn dữ liệu").slice(0, 200)}`);
  return body.data ?? [];
}
