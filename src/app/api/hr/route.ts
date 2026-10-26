import { bluejayViewer } from "@/lib/bluejay-auth";
import { ID_PATTERN, cleanFields, isEntity } from "@/lib/hr-forms";

export const maxDuration = 60;

// The HR data of the Apps Script web app (staff, birthdays, recruitment), read and written on the server so the token never reaches the browser.
const config = () => {
  const base = process.env.HR_APPS_SCRIPT_URL?.trim(), token = process.env.HR_APPS_SCRIPT_TOKEN?.trim();
  return base && token ? { base, token } : null;
};
const NOT_CONFIGURED = { message: "Thiếu HR_APPS_SCRIPT_URL hoặc HR_APPS_SCRIPT_TOKEN trong cấu hình môi trường." };

/** Runs one call against the web app and returns its JSON, or a { message, status } to send back. */
async function callScript(url: URL, init?: RequestInit) {
  try {
    const res = await fetch(url, { ...init, cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(50_000) });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body) return { status: 502, message: `Apps Script không trả JSON (HTTP ${res.status}). Kiểm tra bản triển khai: ứng dụng web, người truy cập là "Bất kỳ ai", đã dán code mới.` };
    if (body.error) return { status: 502, message: String(body.error) };
    return { body };
  } catch (e) {
    return { status: 502, message: e instanceof Error ? e.message : String(e) };
  }
}
const reply = (r: Awaited<ReturnType<typeof callScript>>) => ("body" in r ? Response.json(r.body) : Response.json({ message: r.message }, { status: r.status }));

export async function GET() {
  const denied = await bluejayViewer();
  if (denied) return Response.json({ message: denied.message }, { status: denied.status });
  const cfg = config();
  if (!cfg) return Response.json(NOT_CONFIGURED, { status: 500 });
  const url = new URL(cfg.base);
  url.searchParams.set("action", "data");
  url.searchParams.set("token", cfg.token); // Apps Script web apps cannot read request headers
  return reply(await callScript(url));
}

// Create, edit or delete one row: { entity, action: "save" | "delete", id?, fields? }. Only admins; the fields are cut down to the form's own list first.
export async function POST(request: Request) {
  const denied = await bluejayViewer();
  if (denied) return Response.json({ message: denied.message }, { status: denied.status });
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ message: "Yêu cầu không hợp lệ." }, { status: 415 });
  const cfg = config();
  if (!cfg) return Response.json(NOT_CONFIGURED, { status: 500 });
  const input = await request.json().catch(() => null) as { entity?: unknown; action?: unknown; id?: unknown; fields?: unknown } | null;
  if (!input || !isEntity(input.entity)) return Response.json({ message: "Loại dữ liệu không hợp lệ." }, { status: 400 });
  const id = input.id === undefined || input.id === "" ? undefined : String(input.id);
  if (id !== undefined && !ID_PATTERN.test(id)) return Response.json({ message: "Mã không hợp lệ." }, { status: 400 });
  let payload: Record<string, unknown>;
  if (input.action === "save") {
    try { payload = { entity: input.entity, action: "save", id, fields: cleanFields(input.entity, input.fields) }; }
    catch (e) { return Response.json({ message: e instanceof Error ? e.message : String(e) }, { status: 400 }); }
  } else if (input.action === "delete" && id) payload = { entity: input.entity, action: "delete", id };
  else return Response.json({ message: "Hành động không hợp lệ." }, { status: 400 });
  // text/plain keeps the request simple for Apps Script (no preflight, the body is read from postData)
  return reply(await callScript(new URL(cfg.base), { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ ...payload, token: cfg.token }) }));
}
