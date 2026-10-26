import { bluejayViewer } from "@/lib/bluejay-auth";

export const maxDuration = 60;

// The HR data of the Apps Script web app (staff, birthdays, recruitment), read on the server so the token never reaches the browser. Read only.
export async function GET() {
  const denied = await bluejayViewer();
  if (denied) return Response.json({ message: denied.message }, { status: denied.status });
  const base = process.env.HR_APPS_SCRIPT_URL?.trim(), token = process.env.HR_APPS_SCRIPT_TOKEN?.trim();
  if (!base || !token) return Response.json({ message: "Thiếu HR_APPS_SCRIPT_URL hoặc HR_APPS_SCRIPT_TOKEN trong cấu hình môi trường." }, { status: 500 });
  const url = new URL(base);
  url.searchParams.set("action", "data");
  url.searchParams.set("token", token); // Apps Script web apps cannot read request headers
  try {
    const res = await fetch(url, { cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(50_000) });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body) return Response.json({ message: `Apps Script không trả JSON (HTTP ${res.status}). Kiểm tra bản triển khai: ứng dụng web, người truy cập là "Bất kỳ ai", đã dán code mới.` }, { status: 502 });
    if (body.error) return Response.json({ message: String(body.error) }, { status: 502 });
    return Response.json(body);
  } catch (e) {
    return Response.json({ message: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
