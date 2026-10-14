import { NextResponse, type NextRequest } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/grab-credentials";

// Stores a per-location Grab merchant login. The password is encrypted here and never returned.

async function authorize(locationId: unknown) {
  if (typeof locationId !== "string" || !/^[0-9a-f-]{36}$/i.test(locationId)) {
    return { error: NextResponse.json({ message: "locationId không hợp lệ." }, { status: 400 }) };
  }
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: NextResponse.json({ message: "Chưa đăng nhập." }, { status: 401 }) };
  // RLS: only returns the location when the signed-in user owns it.
  const { data } = await supabase.from("locations").select("id").eq("id", locationId).maybeSingle();
  if (!data) return { error: NextResponse.json({ message: "Không tìm thấy cơ sở." }, { status: 404 }) };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return { error: NextResponse.json({ message: "Thiếu SUPABASE_SERVICE_ROLE_KEY trên máy chủ." }, { status: 500 }) };
  return { db: createServiceClient(url, serviceKey), locationId };
}

export async function GET(request: NextRequest) {
  const ctx = await authorize(request.nextUrl.searchParams.get("locationId"));
  if (ctx.error) return ctx.error;
  const { data } = await ctx.db.from("grab_merchant_accounts").select("username").eq("location_id", ctx.locationId).maybeSingle();
  return NextResponse.json({ username: data?.username ?? "", hasPassword: Boolean(data) });
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const ctx = await authorize(body.locationId);
  if (ctx.error) return ctx.error;
  const username = typeof body.username === "string" ? body.username.trim().slice(0, 200) : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!username) {
    await ctx.db.from("grab_merchant_accounts").delete().eq("location_id", ctx.locationId);
    return NextResponse.json({ ok: true });
  }
  const row: { location_id: string; username: string; password_encrypted?: string; updated_at: string } = {
    location_id: ctx.locationId, username, updated_at: new Date().toISOString(),
  };
  if (password) {
    try { row.password_encrypted = encryptSecret(password.slice(0, 200)); }
    catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "Không mã hóa được mật khẩu." }, { status: 500 }); }
  } else {
    const { data } = await ctx.db.from("grab_merchant_accounts").select("location_id").eq("location_id", ctx.locationId).maybeSingle();
    if (!data) return NextResponse.json({ message: "Cần nhập mật khẩu Grab." }, { status: 400 });
  }
  const { error } = await ctx.db.from("grab_merchant_accounts").upsert(row);
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
