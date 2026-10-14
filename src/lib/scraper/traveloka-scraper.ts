export interface TravelokaTarget {
  id: string;
  name: string;
  travelokaUrl: string;
}

export interface TravelokaResult {
  id: string;
  name: string;
  url: string;
  rating: string | null;
  ratingValue: number | null;
  ratingRaw: string | null;
  count: number | null;
  countRaw: string | null;
  capturedAt: string;
  success: boolean;
  error?: string;
  status?: number;
}

const ACTOR_ID = "oNGp0bCqeqyaErpsH";
const ACTOR_RUN_URL = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items`;

interface TravelokaActorItem {
  pageUrl?: unknown;
  aggregatedReview?: {
    overallRating?: unknown;
    count?: unknown;
  };
}

function parseRating(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 && value <= 10 ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(",", ".");
  const rating = Number(normalized);
  return Number.isFinite(rating) && rating >= 0 && rating <= 10 ? rating : null;
}

function parseCount(value: unknown): number | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/[,.\s]/g, "");
  if (!/^\d+$/.test(normalized)) return null;
  const count = Number(normalized);
  return Number.isSafeInteger(count) ? count : null;
}

function errorResult(target: TravelokaTarget, error: string, status?: number): TravelokaResult {
  return {
    id: target.id,
    name: target.name,
    url: target.travelokaUrl,
    rating: null,
    ratingValue: null,
    ratingRaw: null,
    count: null,
    countRaw: null,
    capturedAt: new Date().toISOString(),
    success: false,
    error,
    ...(status === undefined ? {} : { status }),
  };
}

async function scrapeTravelokaTarget(target: TravelokaTarget, apiToken: string): Promise<TravelokaResult> {
  try {
    const endpoint = new URL(ACTOR_RUN_URL);
    endpoint.searchParams.set("timeout", "300");
    endpoint.searchParams.set("format", "json");

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        urls: [{ url: target.travelokaUrl }],
        max_review_per_page: 1,
        sort_by: "SORT_CREATED_DESCENDING",
        aggregate_ratings: true,
      }),
      signal: AbortSignal.timeout(310_000),
      cache: "no-store",
    });

    if (!response.ok) {
      const details = (await response.text()).replace(/\s+/g, " ").trim().slice(0, 300);
      const suffix = details ? `: ${details}` : "";
      return errorResult(target, `Apify Traveloka lỗi HTTP ${response.status}${suffix}`, response.status);
    }

    const items: unknown = await response.json();
    if (!Array.isArray(items)) {
      return errorResult(target, "Apify Traveloka trả về dữ liệu không đúng định dạng.");
    }

    const item = (items as TravelokaActorItem[]).find((candidate) =>
      candidate && typeof candidate === "object" && candidate.aggregatedReview,
    );
    const aggregate = item?.aggregatedReview;
    const ratingValue = parseRating(aggregate?.overallRating);
    const count = parseCount(aggregate?.count);
    if (ratingValue === null && count === null) {
      return errorResult(target, "Actor không trả về điểm tổng hợp hoặc số lượt đánh giá cho liên kết này.");
    }

    return {
      id: target.id,
      name: target.name,
      url: typeof item?.pageUrl === "string" ? item.pageUrl : target.travelokaUrl,
      rating: ratingValue === null ? null : ratingValue.toFixed(1).replace(".", ","),
      ratingValue,
      ratingRaw: aggregate?.overallRating == null ? null : String(aggregate.overallRating),
      count,
      countRaw: aggregate?.count == null ? null : String(aggregate.count),
      capturedAt: new Date().toISOString(),
      success: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResult(target, `Không thể gọi Apify Traveloka: ${message}`);
  }
}

export async function runTravelokaScraper(targets: TravelokaTarget[]) {
  const apiToken = process.env.APIFY_API_TOKEN?.trim();
  if (!apiToken) {
    const results = targets.map((target) => errorResult(
      target,
      "Thiếu APIFY_API_TOKEN. Thêm token Apify vào cấu hình môi trường rồi khởi động lại ứng dụng.",
    ));
    return { success: false, totalTargets: targets.length, successCount: 0, results };
  }

  const results: TravelokaResult[] = [];
  for (const target of targets) {
    let result = await scrapeTravelokaTarget(target, apiToken);
    // Actor Apify thỉnh thoảng sập (HTTP 400 run-failed) rồi chạy lại là được: thử thêm một lần.
    if (!result.success && result.status && result.status >= 400 && result.status !== 401) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      result = await scrapeTravelokaTarget(target, apiToken);
    }
    results.push(result);
  }
  return {
    success: results.some((result) => result.success),
    totalTargets: targets.length,
    successCount: results.filter((result) => result.success).length,
    results,
  };
}
