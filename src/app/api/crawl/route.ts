import { NextResponse, type NextRequest } from "next/server";
import { runScraper, type ScrapeTarget } from "@/lib/scraper/gmaps-scraper";
import { runTripadvisorScraper, type TripadvisorTarget } from "@/lib/scraper/tripadvisor-scraper";
import { runAgodaScraper, type AgodaTarget } from "@/lib/scraper/agoda-scraper";
import { runBookingScraper, type BookingTarget } from "@/lib/scraper/booking-scraper";
import { runTripcomScraper, type TripcomTarget } from "@/lib/scraper/tripcom-scraper";
import { runExpediaScraper, type ExpediaTarget } from "@/lib/scraper/expedia-scraper";
import { runTravelokaScraper, type TravelokaTarget } from "@/lib/scraper/traveloka-scraper";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_RATING_SCALE } from "@/lib/platforms";
import type { Platform } from "@/lib/types";

// Mutex cờ tránh cào đồng thời nhiều phiên
let isCrawlerActive = false;

const platformDomains = {
  google: ["google.com", "google.com.vn", "goo.gl"],
  tripadvisor: ["tripadvisor.com", "tripadvisor.com.vn"],
  agoda: ["agoda.com"],
  booking: ["booking.com"],
  tripcom: ["trip.com"],
  expedia: ["expedia.com", "expedia.com.vn"],
  traveloka: ["traveloka.com"],
} as const;

function isPlatformUrl(value: unknown, platform: keyof typeof platformDomains): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && platformDomains[platform].some((domain) =>
      url.hostname === domain || url.hostname.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}

export async function GET() {
  return NextResponse.json({
    isRunning: isCrawlerActive,
  });
}

export async function POST(request: NextRequest) {
  if (isCrawlerActive) {
    return NextResponse.json(
      {
        error: "already_running",
        message: "Quá trình cào dữ liệu đang diễn ra. Vui lòng đợi hoàn tất.",
      },
      { status: 409 },
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const headless = true;
    const platform =
      (body.platform as "google" | "tripadvisor" | "agoda" | "booking" | "tripcom" | "expedia" | "traveloka" | "all") ||
      "google";
    const specificLocationId = body.locationId as string | undefined;

    // Kiểm tra Supabase Auth
    let supabase = null;
    let user = null;
    try {
      supabase = await createClient();
      const auth = await supabase.auth.getUser();
      user = auth.data?.user ?? null;
    } catch {
      // Supabase chưa cấu hình hoặc không khả dụng
    }

    let googleTargets: ScrapeTarget[] = [];
    let tripTargets: TripadvisorTarget[] = [];
    let agodaTargets: AgodaTarget[] = [];
    let bookingTargets: BookingTarget[] = [];
    let tripcomTargets: TripcomTarget[] = [];
    let expediaTargets: ExpediaTarget[] = [];
    let travelokaTargets: TravelokaTarget[] = [];

    if (supabase && user) {
      // Đã đăng nhập Supabase -> Lấy cơ sở từ database của user
      let query = supabase.from("locations").select("id,name");

      if (specificLocationId) {
        query = query.eq("id", specificLocationId);
      }

      const { data, error } = await query;
      if (error) {
        return NextResponse.json(
          { error: "database_error", message: error.message },
          { status: 500 },
        );
      }

      const locationRows = data ?? [];
      const locationIds = locationRows.map((row) => row.id);
      const linksByLocation = new Map<string, Partial<Record<Platform, string>>>();
      if (locationIds.length) {
        const { data: linkRows, error: linksError } = await supabase
          .from("location_platforms")
          .select("location_id,platform,url")
          .in("location_id", locationIds);
        if (linksError) {
          return NextResponse.json({ error: "database_error", message: linksError.message }, { status: 500 });
        }
        const crawlPlatforms: Platform[] = ["google", "tripadvisor", "agoda", "booking", "expedia", "tripcom", "traveloka"];
        for (const link of linkRows ?? []) {
          const platformName = link.platform as Platform;
          if (!crawlPlatforms.includes(platformName)) continue;
          const current = linksByLocation.get(link.location_id) ?? {};
          current[platformName] = link.url;
          linksByLocation.set(link.location_id, current);
        }
      }
      const rows = locationRows.map((row) => ({
        id: row.id,
        name: row.name,
        urls: linksByLocation.get(row.id) ?? {},
      }));

      if (platform === "google" || platform === "all") {
        googleTargets = rows.flatMap((row) => {
          const googleUrl = row.urls.google;
          return isPlatformUrl(googleUrl, "google") ? [{ id: row.id, name: row.name, googleUrl }] : [];
        });
      }

      if (platform === "tripadvisor" || platform === "all") {
        tripTargets = rows.flatMap((row) => {
          const tripadvisorUrl = row.urls.tripadvisor;
          return isPlatformUrl(tripadvisorUrl, "tripadvisor") ? [{ id: row.id, name: row.name, tripadvisorUrl }] : [];
        });
      }

      if (platform === "agoda" || platform === "all") {
        agodaTargets = rows.flatMap((row) => {
          const agodaUrl = row.urls.agoda;
          return isPlatformUrl(agodaUrl, "agoda") ? [{ id: row.id, name: row.name, agodaUrl }] : [];
        });
      }

      if (platform === "booking" || platform === "all") {
        bookingTargets = rows.flatMap((row) => {
          const bookingUrl = row.urls.booking;
          return isPlatformUrl(bookingUrl, "booking") ? [{ id: row.id, name: row.name, bookingUrl }] : [];
        });
      }

      if (platform === "tripcom" || platform === "all") {
        tripcomTargets = rows.flatMap((row) => {
          const tripcomUrl = row.urls.tripcom;
          return isPlatformUrl(tripcomUrl, "tripcom") ? [{ id: row.id, name: row.name, tripcomUrl }] : [];
        });
      }

      if (platform === "expedia" || platform === "all") {
        expediaTargets = rows.flatMap((row) => {
          const expediaUrl = row.urls.expedia;
          return isPlatformUrl(expediaUrl, "expedia") ? [{ id: row.id, name: row.name, expediaUrl }] : [];
        });
      }

      if (platform === "traveloka" || platform === "all") {
        travelokaTargets = rows.flatMap((row) => {
          const travelokaUrl = row.urls.traveloka;
          return isPlatformUrl(travelokaUrl, "traveloka") ? [{ id: row.id, name: row.name, travelokaUrl }] : [];
        });
      }
    } else {
      // Chế độ Demo hoặc Client gửi targets lên
      if ((platform === "google" || platform === "all") && Array.isArray(body.googleTargets)) {
        googleTargets = body.googleTargets.filter((target: ScrapeTarget) => isPlatformUrl(target.googleUrl, "google"));
      } else if ((platform === "google" || platform === "all") && Array.isArray(body.targets)) {
        googleTargets = body.targets
          .filter((t: { googleUrl?: string }) => isPlatformUrl(t.googleUrl, "google"))
          .map((t: { id: string; name: string; googleUrl: string }) => ({
            id: t.id,
            name: t.name,
            googleUrl: t.googleUrl,
          }));
      }

      if ((platform === "tripadvisor" || platform === "all") && Array.isArray(body.tripTargets)) {
        tripTargets = body.tripTargets.filter((target: TripadvisorTarget) => isPlatformUrl(target.tripadvisorUrl, "tripadvisor"));
      } else if ((platform === "tripadvisor" || platform === "all") && Array.isArray(body.targets)) {
        tripTargets = body.targets
          .filter((t: { tripadvisorUrl?: string }) => isPlatformUrl(t.tripadvisorUrl, "tripadvisor"))
          .map((t: { id: string; name: string; tripadvisorUrl: string }) => ({
            id: t.id,
            name: t.name,
            tripadvisorUrl: t.tripadvisorUrl,
          }));
      }

      if ((platform === "agoda" || platform === "all") && Array.isArray(body.agodaTargets)) {
        agodaTargets = body.agodaTargets.filter((target: AgodaTarget) => isPlatformUrl(target.agodaUrl, "agoda"));
      } else if ((platform === "agoda" || platform === "all") && Array.isArray(body.targets)) {
        agodaTargets = body.targets
          .filter((t: { agodaUrl?: string }) => isPlatformUrl(t.agodaUrl, "agoda"))
          .map((t: { id: string; name: string; agodaUrl: string }) => ({
            id: t.id,
            name: t.name,
            agodaUrl: t.agodaUrl,
          }));
      }

      if ((platform === "booking" || platform === "all") && Array.isArray(body.bookingTargets)) {
        bookingTargets = body.bookingTargets.filter((target: BookingTarget) => isPlatformUrl(target.bookingUrl, "booking"));
      } else if ((platform === "booking" || platform === "all") && Array.isArray(body.targets)) {
        bookingTargets = body.targets
          .filter((t: { bookingUrl?: string }) => isPlatformUrl(t.bookingUrl, "booking"))
          .map((t: { id: string; name: string; bookingUrl: string }) => ({
            id: t.id,
            name: t.name,
            bookingUrl: t.bookingUrl,
          }));
      }

      if ((platform === "tripcom" || platform === "all") && Array.isArray(body.tripcomTargets)) {
        tripcomTargets = body.tripcomTargets.filter((target: TripcomTarget) => isPlatformUrl(target.tripcomUrl, "tripcom"));
      } else if ((platform === "tripcom" || platform === "all") && Array.isArray(body.targets)) {
        tripcomTargets = body.targets
          .filter((t: { tripcomUrl?: string }) => isPlatformUrl(t.tripcomUrl, "tripcom"))
          .map((t: { id: string; name: string; tripcomUrl: string }) => ({
            id: t.id,
            name: t.name,
            tripcomUrl: t.tripcomUrl,
          }));
      }

      if ((platform === "expedia" || platform === "all") && Array.isArray(body.expediaTargets)) {
        expediaTargets = body.expediaTargets.filter((t: ExpediaTarget) => isPlatformUrl(t.expediaUrl, "expedia"));
      } else if ((platform === "expedia" || platform === "all") && Array.isArray(body.targets)) {
        expediaTargets = body.targets.filter((t: ExpediaTarget) => isPlatformUrl(t.expediaUrl, "expedia"));
      }

      if ((platform === "traveloka" || platform === "all") && Array.isArray(body.travelokaTargets)) {
        travelokaTargets = body.travelokaTargets.filter((t: TravelokaTarget) => isPlatformUrl(t.travelokaUrl, "traveloka"));
      } else if ((platform === "traveloka" || platform === "all") && Array.isArray(body.targets)) {
        travelokaTargets = body.targets.filter((t: TravelokaTarget) => isPlatformUrl(t.travelokaUrl, "traveloka"));
      }
    }

    const totalToScrape =
      googleTargets.length +
      tripTargets.length +
      agodaTargets.length +
      bookingTargets.length +
      tripcomTargets.length +
      expediaTargets.length +
      travelokaTargets.length;
    if (totalToScrape === 0) {
      const platformName =
        platform === "tripcom"
          ? "Trip.com"
          : platform === "booking"
            ? "Booking.com"
            : platform === "agoda"
              ? "Agoda"
              : platform === "tripadvisor"
                ? "Tripadvisor"
                : platform === "google"
                  ? "Google Maps"
                  : platform === "expedia"
                    ? "Expedia"
                    : platform === "traveloka"
                      ? "Traveloka"
                      : "nền tảng";
      return NextResponse.json(
        {
          error: "no_valid_targets",
          message: `Không tìm thấy cơ sở nào có liên kết ${platformName} hợp lệ để cào dữ liệu.`,
        },
        { status: 400 },
      );
    }

    isCrawlerActive = true;

    const allResults: Array<{
      platform: "google" | "tripadvisor" | "agoda" | "booking" | "tripcom" | "expedia" | "traveloka";
      id: string;
      name: string;
      url: string;
      rating: string | null;
      ratingValue: number | null;
      ratingRaw: string | null;
      count: number | null;
      countRaw: string | null;
      rankLabel?: string | null;
      capturedAt: string;
      success: boolean;
      error?: string;
    }> = [];

    let savedCount = 0;

    // 1. Chạy Google Scraper
    if (googleTargets.length > 0) {
      const googleOutput = await runScraper(googleTargets, { headless });
      for (const item of googleOutput.results) {
        allResults.push({ platform: "google", ...item });
        if (supabase && user && item.success) {
          const { error: insErr } = await supabase.from("metric_snapshots").insert({
            location_id: item.id,
            platform: "google",
            rating_scale: DEFAULT_RATING_SCALE.google,
            rating_value: item.ratingValue,
            review_count: item.count,
            count_label: "đánh giá",
            source: "api",
            captured_at: item.capturedAt,
          });
          if (!insErr) savedCount++;
        }
      }
    }

    // 2. Chạy TripAdvisor Scraper
    if (tripTargets.length > 0) {
      const tripOutput = await runTripadvisorScraper(tripTargets);
      for (const item of tripOutput.results) {
        allResults.push({ platform: "tripadvisor", ...item });
        if (supabase && user && item.success) {
          const { error: insErr } = await supabase.from("metric_snapshots").insert({
            location_id: item.id,
            platform: "tripadvisor",
            rating_scale: DEFAULT_RATING_SCALE.tripadvisor,
            rating_value: item.ratingValue,
            review_count: item.count,
            tripadvisor_rank: item.rankLabel,
            count_label: "đánh giá",
            source: "api",
            captured_at: item.capturedAt,
          });
          if (!insErr) savedCount++;
        }
      }
    }

    // 3. Chạy Agoda Scraper
    if (agodaTargets.length > 0) {
      const agodaOutput = await runAgodaScraper(agodaTargets);
      for (const item of agodaOutput.results) {
        allResults.push({ platform: "agoda", ...item });
        if (supabase && user && item.success) {
          const { error: insErr } = await supabase.from("metric_snapshots").insert({
            location_id: item.id,
            platform: "agoda",
            rating_scale: DEFAULT_RATING_SCALE.agoda,
            rating_value: item.ratingValue,
            review_count: item.count,
            count_label: "đánh giá",
            source: "api",
            captured_at: item.capturedAt,
          });
          if (!insErr) savedCount++;
        }
      }
    }

    // 4. Chạy Booking Scraper
    if (bookingTargets.length > 0) {
      const bookingOutput = await runBookingScraper(bookingTargets, { headless });
      for (const item of bookingOutput.results) {
        allResults.push({ platform: "booking", ...item });
        if (supabase && user && item.success) {
          const { error: insErr } = await supabase.from("metric_snapshots").insert({
            location_id: item.id,
            platform: "booking",
            rating_scale: DEFAULT_RATING_SCALE.booking,
            rating_value: item.ratingValue,
            review_count: item.count,
            count_label: "đánh giá",
            source: "api",
            captured_at: item.capturedAt,
          });
          if (!insErr) savedCount++;
        }
      }
    }

    // 5. Chạy Trip.com Scraper
    if (tripcomTargets.length > 0) {
      const tripcomOutput = await runTripcomScraper(tripcomTargets, { headless });
      for (const item of tripcomOutput.results) {
        allResults.push({ platform: "tripcom", ...item });
        if (supabase && user && item.success) {
          const { error: insErr } = await supabase.from("metric_snapshots").insert({
            location_id: item.id,
            platform: "tripcom",
            rating_scale: DEFAULT_RATING_SCALE.tripcom,
            rating_value: item.ratingValue,
            review_count: item.count,
            count_label: "đánh giá",
            source: "api",
            captured_at: item.capturedAt,
          });
          if (!insErr) savedCount++;
        }
      }
    }

    if (expediaTargets.length > 0) {
      const output = await runExpediaScraper(expediaTargets);
      for (const item of output.results) {
        allResults.push({ platform: "expedia", ...item });
        if (supabase && user && (item.ratingValue != null || item.count != null)) {
          const { error: insertError } = await supabase.from("metric_snapshots").insert({
            location_id: item.id,
            platform: "expedia",
            rating_scale: DEFAULT_RATING_SCALE.expedia,
            rating_value: item.ratingValue,
            review_count: item.count,
            count_label: "nhận xét",
            source: "api",
            captured_at: item.capturedAt,
          });
          if (!insertError) savedCount++;
        }
      }
    }

    if (travelokaTargets.length > 0) {
      const output = await runTravelokaScraper(travelokaTargets);
      for (const item of output.results) {
        allResults.push({ platform: "traveloka", ...item });
        if (supabase && user && item.success) {
          const { error: insertError } = await supabase.from("metric_snapshots").insert({
            location_id: item.id,
            platform: "traveloka",
            rating_scale: DEFAULT_RATING_SCALE.traveloka,
            rating_value: item.ratingValue,
            review_count: item.count,
            count_label: "đánh giá",
            source: "api",
            captured_at: item.capturedAt,
          });
          if (!insertError) savedCount++;
        }
      }
    }

    const successfulResults = allResults.filter((r) => r.success);
    const failedResults = allResults.filter((r) => !r.success);
    const failureSummary = failedResults
      .map((result) => `${result.name}: ${result.error ?? "không tìm thấy số liệu"}`)
      .join("; ");
    const allSucceeded = successfulResults.length === totalToScrape;
    const upstreamRateLimited = failedResults.some((result) => result.error?.includes("HTTP 429"));
    const responseStatus = allSucceeded ? 200 : upstreamRateLimited ? 429 : successfulResults.length === 0 ? 502 : 207;

    return NextResponse.json({
      success: allSucceeded,
      platform,
      totalTargets: totalToScrape,
      successCount: successfulResults.length,
      savedCount,
      results: allResults,
      message: `Kết quả crawl: ${successfulResults.length}/${totalToScrape} liên kết thành công.${failureSummary ? ` Lỗi: ${failureSummary}` : ""}`,
    }, { status: responseStatus });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Lỗi khi xử lý cào dữ liệu:", errorMsg);
    return NextResponse.json(
      { error: "crawler_exception", message: `Lỗi cào dữ liệu: ${errorMsg}` },
      { status: 500 },
    );
  } finally {
    isCrawlerActive = false;
  }
}
