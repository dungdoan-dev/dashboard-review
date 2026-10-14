import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hotelPlatforms, scrape, validUrl, type HotelPlatform } from "@/lib/hotel-sync";

export const maxDuration = 300;

// Chạy thử đồng bộ cho một khách sạn: cào từng nguồn như cron nhưng KHÔNG lưu snapshot và KHÔNG chốt sổ.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const locationId = typeof body.locationId === "string" ? body.locationId : "";
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ message: "Chưa đăng nhập." }, { status: 401 });
  // RLS: chỉ trả về cơ sở thuộc tài khoản đang đăng nhập.
  const { data: location } = await supabase.from("locations").select("id,name,type").eq("id", locationId).maybeSingle();
  if (!location || location.type !== "hotel") return NextResponse.json({ message: "Không tìm thấy khách sạn." }, { status: 404 });
  const { data: links, error } = await supabase.from("location_platforms").select("platform,url").eq("location_id", location.id).in("platform", hotelPlatforms);
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  if (!links?.length) return NextResponse.json({ message: "Khách sạn chưa có nguồn đồng bộ." }, { status: 400 });

  const results = [];
  for (const link of links) {
    const platform = link.platform as HotelPlatform;
    const startedAt = Date.now();
    if (!validUrl(platform, link.url)) {
      results.push({ platform, ok: false, error: "Liên kết không hợp lệ.", seconds: 0 });
      continue;
    }
    try {
      const result = await scrape(platform, location.id, location.name, link.url);
      const ok = Boolean(result?.success && (result.ratingValue != null || result.count != null));
      results.push({
        platform, ok, rating: result?.ratingValue ?? null, count: result?.count ?? null,
        rank: result?.rankLabel ?? null, error: ok ? undefined : result?.error ?? "Không lấy được số liệu.",
        seconds: Math.round((Date.now() - startedAt) / 1000),
      });
    } catch (cause) {
      results.push({ platform, ok: false, error: cause instanceof Error ? cause.message : String(cause), seconds: Math.round((Date.now() - startedAt) / 1000) });
    }
  }
  return NextResponse.json({ name: location.name, allOk: results.every((r) => r.ok), results });
}
