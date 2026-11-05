import { bluejayViewer } from "@/lib/bluejay-auth";
import { createClient } from "@/lib/supabase/server";
import { SECRET_KEYS, listSecrets, removeSecret, saveSecret, secret } from "@/lib/app-secrets";

const fail = (message: string, status: number) => Response.json({ message }, { status });

// Cài đặt → Khóa API. Admin only (src/proxy.ts and bluejayViewer). Values are written here and sent back only for the eye button (?name=).
export async function GET(request: Request) {
  const denied = await bluejayViewer();
  if (denied) return fail(denied.message, denied.status);
  // ?name=: the value itself, only when the eye button of that key is pressed (admin only, never cached).
  const name = new URL(request.url).searchParams.get("name");
  if (name !== null) {
    if (!SECRET_KEYS.some((k) => k.name === name)) return fail("Khóa không hợp lệ.", 400);
    return Response.json({ value: await secret(name) }, { headers: { "cache-control": "no-store" } });
  }
  try { return Response.json(await listSecrets()); } catch (e) { return fail(e instanceof Error ? e.message : String(e), 502); }
}

function invalid(name: string, value: string) {
  if (name === "GOOGLE_SERVICE_ACCOUNT_JSON") {
    try { const key = JSON.parse(value); if (!key.client_email || !key.private_key || !key.token_uri) return "JSON thiếu client_email, private_key hoặc token_uri."; } catch { return "Không phải JSON hợp lệ."; }
  }
  if ((name === "HR_APPS_SCRIPT_URL" || name === "ASSET_APPS_SCRIPT_URL") &&!/^https:\/\/\S+$/.test(value)) return "Địa chỉ phải bắt đầu bằng https://.";
  return value.length > 20_000 ? "Giá trị quá dài." : null;
}

// { name, value }: replaces the stored value of that key.
export async function PUT(request: Request) {
  const denied = await bluejayViewer();
  if (denied) return fail(denied.message, denied.status);
  if (!request.headers.get("content-type")?.includes("application/json")) return fail("Yêu cầu không hợp lệ.", 415);
  const input = (await request.json().catch(() => null)) as { name?: unknown; value?: unknown } | null;
  const name = typeof input?.name === "string" ? input.name : "", value = typeof input?.value === "string" ? input.value.trim() : "";
  if (!SECRET_KEYS.some((k) => k.name === name)) return fail("Khóa không hợp lệ.", 400);
  if (!value) return fail("Chưa nhập giá trị.", 400);
  const problem = invalid(name, value);
  if (problem) return fail(problem, 400);
  try {
    const { data } = await (await createClient()).auth.getUser();
    await saveSecret(name, value, data.user?.id ?? null);
    return Response.json({ ok: true });
  } catch (e) { return fail(e instanceof Error ? e.message : String(e), 502); }
}

// ?name=: drops the stored value; the key falls back to the server's .env.
export async function DELETE(request: Request) {
  const denied = await bluejayViewer();
  if (denied) return fail(denied.message, denied.status);
  const name = new URL(request.url).searchParams.get("name") ?? "";
  if (!SECRET_KEYS.some((k) => k.name === name)) return fail("Khóa không hợp lệ.", 400);
  try { await removeSecret(name); return Response.json({ ok: true }); } catch (e) { return fail(e instanceof Error ? e.message : String(e), 502); }
}
