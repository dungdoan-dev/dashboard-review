import type { SupabaseClient } from "@supabase/supabase-js";
import type { Platform as AnyPlatform } from "@/lib/types";
import { decryptSecret } from "@/lib/grab-credentials";
import { runGrabfoodScraper } from "@/lib/scraper/grabfood-scraper";
import { runScraper } from "@/lib/scraper/gmaps-scraper";
import { runTripadvisorScraper } from "@/lib/scraper/tripadvisor-scraper";
import { runAgodaScraper } from "@/lib/scraper/agoda-scraper";
import { runBookingScraper } from "@/lib/scraper/booking-scraper";
import { runTripcomScraper } from "@/lib/scraper/tripcom-scraper";
import { runExpediaScraper } from "@/lib/scraper/expedia-scraper";
import { runTravelokaScraper } from "@/lib/scraper/traveloka-scraper";

// Dùng chung cho cron đồng bộ tự động và nút "Chạy thử" trong Cài đặt; chỉ gồm nguồn khách sạn.
export type HotelPlatform = Exclude<AnyPlatform, "grabfood" | "shopeefood">;
type Platform = HotelPlatform;

export const hotelPlatforms: Platform[] = ["google", "tripadvisor", "agoda", "booking", "expedia", "tripcom", "traveloka"];
const platformDomains: Record<Platform, string[]> = {
  google: ["google.com", "google.com.vn", "goo.gl"],
  tripadvisor: ["tripadvisor.com", "tripadvisor.com.vn"],
  agoda: ["agoda.com"], booking: ["booking.com"], expedia: ["expedia.com", "expedia.com.vn"],
  tripcom: ["trip.com"], traveloka: ["traveloka.com"],
};
export type Result = { success: boolean; ratingValue: number | null; count: number | null; capturedAt: string; error?: string; rankLabel?: string | null; tripadvisorNotice?: string | null };

export function validUrl(platform: Platform, value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && platformDomains[platform].some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
  } catch { return false; }
}

export async function scrape(platform: Platform, id: string, name: string, url: string): Promise<Result> {
  const one = async (run: Promise<{ results: Result[]; message?: string }>): Promise<Result> => {
    const output = await run;
    // Khi trình duyệt không khởi động được, scraper trả results rỗng kèm message: giữ lại lỗi thật.
    return output.results[0] ?? { success: false, ratingValue: null, count: null, capturedAt: new Date().toISOString(), error: output.message };
  };
  switch (platform) {
    case "google": return one(runScraper([{ id, name, googleUrl: url }], { headless: true }));
    case "tripadvisor": return (await runTripadvisorScraper([{ id, name, tripadvisorUrl: url }])).results[0];
    case "agoda": return (await runAgodaScraper([{ id, name, agodaUrl: url }])).results[0];
    case "booking": return one(runBookingScraper([{ id, name, bookingUrl: url }], { headless: true }));
    case "expedia": return (await runExpediaScraper([{ id, name, expediaUrl: url }])).results[0];
    case "tripcom": return one(runTripcomScraper([{ id, name, tripcomUrl: url }], { headless: true }));
    case "traveloka": return (await runTravelokaScraper([{ id, name, travelokaUrl: url }])).results[0];
  }
}

// ---- Cafe / Mart 24h: thêm GrabFood (tài khoản merchant lưu trong database) ----
export type SyncType = "hotel" | "cafe" | "mart" | "entertainment";
export type SyncPlatform = AnyPlatform;
export const syncPlatforms: Record<SyncType, SyncPlatform[]> = {
  hotel: hotelPlatforms,
  cafe: ["google", "tripadvisor", "grabfood"],
  mart: ["google", "tripadvisor", "grabfood"],
  entertainment: ["google", "tripadvisor"],
};
export type SyncSource = { platform: SyncPlatform; url: string };

/** Nguồn cần đồng bộ của một cơ sở: các liên kết đã lưu cộng GrabFood nếu có tài khoản merchant. `db` phải đọc được grab_merchant_accounts (service role). */
export async function listSources(db: SupabaseClient, locationId: string, type: SyncType): Promise<SyncSource[]> {
  const urlPlatforms = syncPlatforms[type].filter((platform) => platform !== "grabfood");
  const { data: links, error } = await db.from("location_platforms").select("platform,url").eq("location_id", locationId).in("platform", urlPlatforms);
  if (error) throw error;
  const sources: SyncSource[] = (links ?? []).map((link) => ({ platform: link.platform as SyncPlatform, url: link.url }));
  if (syncPlatforms[type].includes("grabfood")) {
    const { data: account } = await db.from("grab_merchant_accounts").select("location_id").eq("location_id", locationId).maybeSingle();
    if (account) sources.push({ platform: "grabfood", url: "" });
  }
  return sources;
}

/** Cào một nguồn; mọi lỗi (liên kết sai, thiếu tài khoản...) trả về dạng Result thất bại có thông báo. */
export async function syncSource(db: SupabaseClient, source: SyncSource, location: { id: string; name: string }): Promise<Result> {
  const failed = (error: string): Result => ({ success: false, ratingValue: null, count: null, capturedAt: new Date().toISOString(), error });
  if (source.platform === "grabfood") {
    const { data: account } = await db.from("grab_merchant_accounts").select("username,password_encrypted").eq("location_id", location.id).maybeSingle();
    if (!account) return failed("Chưa có tài khoản Grab merchant cho cơ sở này.");
    const output = await runGrabfoodScraper([{ id: location.id, name: location.name, username: account.username, password: decryptSecret(account.password_encrypted) }]);
    return output.results[0] ?? failed("GrabFood không trả kết quả.");
  }
  const platform = source.platform as Platform;
  if (!validUrl(platform, source.url)) return failed("Liên kết không hợp lệ.");
  return scrape(platform, location.id, location.name, source.url);
}
