import { secret } from "@/lib/app-secrets";
import { hrViewer } from "@/lib/bluejay-auth";
import { cleanAssetFields, isAssetTab } from "@/lib/asset-forms";

export const maxDuration = 60;

// The asset Google Sheet through its Apps Script web app (scripts/apps-script/quan-ly-tai-san.gs), on the server so the token never reaches the browser.
const config = async () => {
  const [base, token] = await Promise.all([secret("ASSET_APPS_SCRIPT_URL"), secret("ASSET_APPS_SCRIPT_TOKEN")]);
  return base && token ? { base, token } : null;
};
const NOT_CONFIGURED = { message: "Chưa cấu hình Apps Script tài sản: vào Cài đặt > Khóa API, điền \"Tài sản · địa chỉ\" và \"Tài sản · mã truy cập\"." };

async function callScript(url: URL, init?: RequestInit) {
  try {
    const res = await fetch(url, { ...init, cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(50_000) });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body) return Response.json({ message: `Apps Script không trả JSON (HTTP ${res.status}). Kiểm tra bản triển khai: ứng dụng web, người truy cập là "Bất kỳ ai", đã dán code mới.` }, { status: 502 });
    if (body.error) return Response.json({ message: String(body.error) }, { status: 502 });
    return Response.json(body);
  } catch (e) {
    return Response.json({ message: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

export async function GET() {
  const denied = await hrViewer();
  if (denied) return Response.json({ message: denied.message }, { status: denied.status });
  const cfg = await config();
  if (!cfg) return Response.json(NOT_CONFIGURED, { status: 500 });
  const url = new URL(cfg.base);
  url.searchParams.set("action", "data");
  url.searchParams.set("token", cfg.token); // Apps Script web apps cannot read request headers
  return callScript(url);
}

// Create, edit or delete one row: { tab, action: "save" | "delete", row?, key?, values? }. Admins and hr accounts; values are cut down to the tab's input columns.
export async function POST(request: Request) {
  const denied = await hrViewer();
  if (denied) return Response.json({ message: denied.message }, { status: denied.status });
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ message: "Yêu cầu không hợp lệ." }, { status: 415 });
  const cfg = await config();
  if (!cfg) return Response.json(NOT_CONFIGURED, { status: 500 });
  const input = await request.json().catch(() => null) as { tab?: unknown; action?: unknown; row?: unknown; key?: unknown; values?: unknown } | null;
  if (!input || !isAssetTab(input.tab)) return Response.json({ message: "Tab không hợp lệ." }, { status: 400 });
  const row = input.row === undefined || input.row === null ? 0 : Number(input.row);
  if (!Number.isInteger(row) || row < 0 || row > 100_000) return Response.json({ message: "Dòng không hợp lệ." }, { status: 400 });
  const key = String(input.key ?? "").slice(0, 300);
  let payload: Record<string, unknown>;
  if (input.action === "save") {
    try { payload = { tab: input.tab, action: "save", row: row || undefined, key, values: cleanAssetFields(input.tab, input.values) }; }
    catch (e) { return Response.json({ message: e instanceof Error ? e.message : String(e) }, { status: 400 }); }
  } else if (input.action === "delete" && row) payload = { tab: input.tab, action: "delete", row, key };
  else return Response.json({ message: "Hành động không hợp lệ." }, { status: 400 });
  // text/plain keeps the request simple for Apps Script (no preflight, the body is read from postData)
  return callScript(new URL(cfg.base), { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ ...payload, token: cfg.token }) });
}
