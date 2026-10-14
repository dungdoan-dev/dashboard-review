import { NextResponse, type NextRequest } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { listSources, syncSource, type SyncType } from "@/lib/hotel-sync";

export const maxDuration = 300;

// Chạy thử đồng bộ cho một cơ sở (khách sạn, cafe hoặc mart): cào từng nguồn như cron nhưng KHÔNG lưu snapshot và KHÔNG chốt sổ.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const locationId = typeof body.locationId === "string" ? body.locationId : "";
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ message: "Chưa đăng nhập." }, { status: 401 });
  // RLS: chỉ trả về cơ sở thuộc tài khoản đang đăng nhập.
  const { data: location } = await supabase.from("locations").select("id,name,type").eq("id", locationId).maybeSingle();
  if (!location || !["hotel", "cafe", "mart"].includes(location.type)) return NextResponse.json({ message: "Không tìm thấy cơ sở." }, { status: 404 });

  // Tài khoản Grab chỉ đọc được bằng service role; quyền sở hữu đã kiểm tra ở trên.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ message: "Thiếu SUPABASE_SERVICE_ROLE_KEY trên máy chủ." }, { status: 500 });
  const db = createServiceClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let sources;
  try {
    sources = await listSources(db, location.id, location.type as SyncType);
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
  if (!sources.length) return NextResponse.json({ message: "Cơ sở chưa có nguồn đồng bộ." }, { status: 400 });

  const results = [];
  for (const source of sources) {
    const startedAt = Date.now();
    const seconds = () => Math.round((Date.now() - startedAt) / 1000);
    try {
      const result = await syncSource(db, source, location);
      const ok = Boolean(result?.success && (result.ratingValue != null || result.count != null));
      results.push({
        platform: source.platform, ok, rating: result?.ratingValue ?? null, count: result?.count ?? null,
        rank: result?.rankLabel ?? null, error: ok ? undefined : result?.error ?? "Không lấy được số liệu.", seconds: seconds(),
      });
    } catch (cause) {
      results.push({ platform: source.platform, ok: false, error: cause instanceof Error ? cause.message : String(cause), seconds: seconds() });
    }
  }
  return NextResponse.json({ name: location.name, allOk: results.every((r) => r.ok), results });
}
