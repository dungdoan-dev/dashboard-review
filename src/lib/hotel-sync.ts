import type { Platform as AnyPlatform } from "@/lib/types";
import { runScraper } from "@/lib/scraper/gmaps-scraper";
import { runTripadvisorScraper } from "@/lib/scraper/tripadvisor-scraper";
import { runAgodaScraper } from "@/lib/scraper/agoda-scraper";
import { runBookingScraper } from "@/lib/scraper/booking-scraper";
import { runTripcomScraper } from "@/lib/scraper/tripcom-scraper";
import { runExpediaScraper } from "@/lib/scraper/expedia-scraper";
import { runTravelokaScraper } from "@/lib/scraper/traveloka-scraper";

// Dùng chung cho cron đồng bộ tự động và nút "Chạy thử" trong Cài đặt; chỉ gồm nguồn khách sạn.
export type HotelPlatform = Exclude<AnyPlatform, "grabfood">;
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
