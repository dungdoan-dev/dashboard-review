export interface AgodaTarget {
  id: string;
  name: string;
  agodaUrl: string;
}

export interface AgodaResult {
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

const ACTOR_ID = "399kmWuTEPga6fcAe";
const ACTOR_RUN_URL = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items`;

interface AgodaActorItem {
  [key: string]: unknown;
  hotelUrl?: unknown;
  rating?: unknown;
  ratings?: unknown;
  overallRating?: unknown;
  reviewScore?: unknown;
  ratingValue?: unknown;
  reviewCount?: unknown;
  ratingCount?: unknown;
  numberOfReviews?: unknown;
}

function parseRating(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 && value <= 10 ? value : null;
  if (typeof value !== "string") return null;
  const match = value.trim().replace(",", ".").match(/(?:^|\D)(10(?:\.\d{1,2})?|[0-9](?:\.\d{1,2})?)(?:\D|$)/);
  const rating = match ? Number(match[1]) : Number.NaN;
  return Number.isFinite(rating) && rating >= 0 && rating <= 10 ? rating : null;
}

function parseCount(value: unknown): number | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? value : null;
  if (typeof value !== "string") return null;
  const match = value.match(/[\d][\d,.\s]*/);
  if (!match) return null;
  const normalized = match[0].trim().replace(/[,.\s]/g, "");
  const count = Number(normalized);
  return Number.isSafeInteger(count) ? count : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function firstParsed(values: unknown[], parser: (value: unknown) => number | null): number | null {
  for (const value of values) {
    const parsed = parser(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function errorResult(target: AgodaTarget, error: string, status?: number): AgodaResult {
  return {
    id: target.id,
    name: target.name,
    url: target.agodaUrl,
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

async function scrapeAgodaTarget(target: AgodaTarget, apiToken: string): Promise<AgodaResult> {
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
        hotelUrls: [target.agodaUrl],
        maxItems: 1,
        includeMedia: false,
        useBrowser: true,
      }),
      signal: AbortSignal.timeout(310_000),
      cache: "no-store",
    });

    if (!response.ok) {
      const details = (await response.text()).replace(/\s+/g, " ").trim().slice(0, 300);
      const suffix = details ? `: ${details}` : "";
      return errorResult(target, `Apify Agoda lỗi HTTP ${response.status}${suffix}`, response.status);
    }

    const payload: unknown = await response.json();
    const items: unknown[] = Array.isArray(payload)
      ? payload
      : payload == null
        ? []
        : [payload];
    const item = items.map(asRecord).find(
      (candidate): candidate is Record<string, unknown> => candidate !== null,
    );
    if (!item) {
      return errorResult(target, "Apify Agoda chạy xong nhưng không trả bản ghi khách sạn (dataset rỗng).");
    }

    const rating = asRecord(item.rating)
      ?? (item.value !== undefined || item.reviewCount !== undefined ? item : null);
    const combinedRating = asRecord(rating?.combined);
    const ratings = asRecord(item.ratings);
    const ratingValue = firstParsed([
      rating?.value,
      rating?.score,
      combinedRating?.value,
      combinedRating?.score,
      ratings?.value,
      ratings?.score,
      item.rating,
      item.overallRating,
      item.reviewScore,
      item.ratingValue,
      item["review-score"],
      item.review_score,
      item.rating_value,
    ], parseRating);
    const count = firstParsed([
      rating?.reviewCount,
      rating?.count,
      // combined = Agoda + nguồn đối tác (368), không phải số đánh giá trên Agoda (151) nên không dùng làm dự phòng.
      ratings?.reviewCount,
      ratings?.count,
      item.reviewCount,
      item.ratingCount,
      item.numberOfReviews,
      item["review-count"],
      item.review_count,
      item.rating_count,
    ], parseCount);
    if (ratingValue === null && count === null) {
      const returnedFields = Object.keys(asRecord(item) ?? {}).slice(0, 24).join(", ") || "không có trường";
      return errorResult(target, `Actor trả bản ghi khách sạn nhưng thiếu điểm và số lượt đánh giá. Các trường nhận được: ${returnedFields}.`);
    }

    return {
      id: target.id,
      name: target.name,
      url: typeof item?.hotelUrl === "string" ? item.hotelUrl : target.agodaUrl,
      rating: ratingValue === null ? null : ratingValue.toFixed(1).replace(".", ","),
      ratingValue,
      ratingRaw: ratingValue == null ? null : String(ratingValue),
      count,
      countRaw: count == null ? null : String(count),
      capturedAt: new Date().toISOString(),
      success: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResult(target, `Không thể gọi Apify Agoda: ${message}`);
  }
}

export async function runAgodaScraper(targets: AgodaTarget[]) {
  const apiToken = process.env.APIFY_API_TOKEN?.trim();
  if (!apiToken) {
    const results = targets.map((target) => errorResult(
      target,
      "Thiếu APIFY_API_TOKEN. Thêm token Apify vào cấu hình môi trường rồi khởi động lại ứng dụng.",
    ));
    return { success: false, totalTargets: targets.length, successCount: 0, results };
  }

  const results: AgodaResult[] = [];
  for (const target of targets) {
    results.push(await scrapeAgodaTarget(target, apiToken));
  }
  return {
    success: results.some((result) => result.success),
    totalTargets: targets.length,
    successCount: results.filter((result) => result.success).length,
    results,
  };
}
