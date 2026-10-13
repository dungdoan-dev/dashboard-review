export interface TripadvisorTarget {
  id: string;
  name: string;
  tripadvisorUrl: string;
}

export interface TripadvisorResult {
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

const ACTOR_ID = "Hvp4YfFGyLM635Q2F";
const ACTOR_RUN_URL = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items`;
const ACTOR_TIMEOUT_SECONDS = 300;

interface TripadvisorActorItem {
  placeInfo?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseRating(value: unknown): number | null {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value.trim().replace(",", "."))
      : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 5 ? parsed : null;
}

function parseCount(value: unknown): number | null {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value.trim().replace(/[,.\s]/g, ""))
      : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function errorResult(target: TripadvisorTarget, error: string, status?: number): TripadvisorResult {
  return {
    id: target.id,
    name: target.name,
    url: target.tripadvisorUrl,
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

async function scrapeTripadvisorTarget(
  target: TripadvisorTarget,
  apiToken: string,
): Promise<TripadvisorResult> {
  try {
    const endpoint = new URL(ACTOR_RUN_URL);
    endpoint.searchParams.set("timeout", String(ACTOR_TIMEOUT_SECONDS));
    endpoint.searchParams.set("format", "json");

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startUrls: [{ url: target.tripadvisorUrl }],
        maxItemsPerQuery: 1,
        scrapeReviewerInfo: false,
      }),
      signal: AbortSignal.timeout((ACTOR_TIMEOUT_SECONDS + 10) * 1000),
      cache: "no-store",
    });

    if (!response.ok) {
      const details = (await response.text()).replace(/\s+/g, " ").trim().slice(0, 300);
      return errorResult(
        target,
        `Apify Tripadvisor lỗi HTTP ${response.status}${details ? `: ${details}` : ""}`,
        response.status,
      );
    }

    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) {
      return errorResult(target, "Apify Tripadvisor trả dataset không đúng định dạng.");
    }

    const items = (payload as TripadvisorActorItem[])
      .map((item) => ({ item: asRecord(item), place: asRecord(item?.placeInfo) }))
      .filter((row): row is { item: Record<string, unknown>; place: Record<string, unknown> } => row.item !== null && row.place !== null);
    if (!items.length) {
      return errorResult(target, "Actor Tripadvisor chạy xong nhưng dataset không có placeInfo.");
    }

    // placeInfo is repeated on review rows; select a row containing the aggregate fields.
    const summary = items.find(({ place }) =>
      parseRating(place.rating) !== null || parseCount(place.numberOfReviews) !== null,
    ) ?? items[0];
    const ratingValue = parseRating(summary.place.rating);
    const count = parseCount(summary.place.numberOfReviews);
    if (ratingValue === null && count === null) {
      const fields = Object.keys(summary.place).slice(0, 24).join(", ") || "không có trường";
      return errorResult(target, `Actor Tripadvisor không trả điểm tổng hợp hoặc số lượt đánh giá. Các trường placeInfo: ${fields}.`);
    }

    return {
      id: target.id,
      name: target.name,
      url: typeof summary.place.webUrl === "string" ? summary.place.webUrl : target.tripadvisorUrl,
      rating: ratingValue === null ? null : ratingValue.toFixed(1).replace(".", ","),
      ratingValue,
      ratingRaw: summary.place.rating == null ? null : String(summary.place.rating),
      count,
      countRaw: summary.place.numberOfReviews == null ? null : String(summary.place.numberOfReviews),
      capturedAt: new Date().toISOString(),
      success: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResult(target, `Không thể gọi Apify Tripadvisor: ${message}`);
  }
}

export async function runTripadvisorScraper(targets: TripadvisorTarget[]) {
  const apiToken = process.env.APIFY_API_TOKEN?.trim();
  if (!apiToken) {
    const results = targets.map((target) => errorResult(
      target,
      "Thiếu APIFY_API_TOKEN. Thêm token Apify vào cấu hình môi trường rồi khởi động lại ứng dụng.",
    ));
    return { success: false, totalTargets: targets.length, successCount: 0, results };
  }

  const results: TripadvisorResult[] = [];
  for (const target of targets) {
    results.push(await scrapeTripadvisorTarget(target, apiToken));
  }
  return {
    success: results.some((result) => result.success),
    totalTargets: targets.length,
    successCount: results.filter((result) => result.success).length,
    results,
  };
}
