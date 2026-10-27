// Talks to the Apps Script web app (scripts/apps-script/khoa-tuan.gs) that protects the rows of a week in the hotel's Google Sheet.
// Needs SHEETS_LOCK_URL (the web app /exec address) and SHEETS_LOCK_TOKEN (same as the script's TOKEN property).
type Call = { action: "status" | "lock" | "unlock"; hotel: number; sheetId: string; month: string; week?: string }; // sheetId: the hotel's sheet from branch_sheets, so the script needs no list of its own

export async function sheetLock(call: Call): Promise<{ weeks?: string[]; rows?: number }> {
  const url = process.env.SHEETS_LOCK_URL?.trim(), token = process.env.SHEETS_LOCK_TOKEN?.trim();
  if (!url || !token) throw new Error("Chưa cấu hình khóa tuần trong Google Sheet.");
  // text/plain keeps this a simple request: Apps Script answers through a redirect that fetch follows.
  const res = await fetch(url, { method: "POST", headers: { "content-type": "text/plain;charset=utf-8" }, body: JSON.stringify({ ...call, token }), redirect: "follow", cache: "no-store" });
  const body = await res.json().catch(() => null) as { ok?: boolean; message?: string; weeks?: string[]; rows?: number } | null;
  if (!body?.ok) throw new Error(body?.message ?? `Khóa tuần lỗi ${res.status}.`);
  return body;
}
