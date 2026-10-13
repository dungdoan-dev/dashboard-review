export interface ExpediaTarget {
  id: string;
  name: string;
  expediaUrl: string;
}

export interface ExpediaResult {
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
}

const ZENROWS_FETCH_ENDPOINT = "https://api.zenrows.com/v1/";
const ZENROWS_TIMEOUT_MS = 180_000;

function parseExpediaMarkdown(markdown: string) {
  // ZenRows Markdown may preserve Expedia's JSON with one or more escape layers.
  const normalizedMarkdown = markdown.replace(/\\+"/g, '"');
  const structuredRatingText = normalizedMarkdown.match(
    /["']?guest_rating["']?\s*:\s*["']?(\d{1,2}(?:[,.]\d+)?)/i,
  )?.[1];
  const proseRatingText = normalizedMarkdown.match(
    /\b(\d{1,2}(?:[,.]\d)?)(?:\s*\d{1,2}(?:[,.]\d)?)?\s*(?:trên\s*10|out\s+of\s+10|\/\s*10)\b/i,
  )?.[1];
  const ratingText = structuredRatingText ?? proseRatingText;
  const structuredCountText = normalizedMarkdown.match(
    /["']?guest_rating_count["']?\s*:\s*["']?(\d[\d.,]*)/i,
  )?.[1];
  const proseCountText = normalizedMarkdown.match(
    /(?:xem\s+tất\s+cả|see\s+all)\s+([\d.,]+)\s+(?:nhận\s+xét|reviews?)/i,
  )?.[1];
  const countText = structuredCountText ?? proseCountText;
  const ratingValue = ratingText == null ? null : Number(ratingText.replace(",", "."));
  const countDigits = countText?.replace(/[.,]/g, "");
  const count = countDigits == null ? null : Number(countDigits);

  return {
    ratingValue: ratingValue != null && Number.isFinite(ratingValue) && ratingValue >= 0 && ratingValue <= 10
      ? ratingValue
      : null,
    ratingRaw: ratingText ?? null,
    count: count != null && Number.isSafeInteger(count) && count >= 0 ? count : null,
    countRaw: countText ?? null,
  };
}

function errorResult(target: ExpediaTarget, error: string): ExpediaResult {
  return {
    id: target.id,
    name: target.name,
    url: target.expediaUrl,
    rating: null,
    ratingValue: null,
    ratingRaw: null,
    count: null,
    countRaw: null,
    capturedAt: new Date().toISOString(),
    success: false,
    error,
  };
}

export async function scrapeExpediaPage(target: ExpediaTarget): Promise<ExpediaResult> {
  const apiKey = process.env.ZENROWS_API_KEY?.trim();
  if (!apiKey) {
    return errorResult(target, "Thiếu ZENROWS_API_KEY. Thêm key mới vào .env.local rồi khởi động lại ứng dụng.");
  }

  try {
    const canonicalUrl = new URL(target.expediaUrl);
    canonicalUrl.search = "";
    canonicalUrl.hash = "";

    const requestUrl = new URL(ZENROWS_FETCH_ENDPOINT);
    requestUrl.searchParams.set("apikey", apiKey);
    requestUrl.searchParams.set("url", canonicalUrl.toString());
    requestUrl.searchParams.set("mode", "auto");
    requestUrl.searchParams.set("response_type", "markdown");
    requestUrl.searchParams.set("original_status", "true");

    const response = await fetch(requestUrl, {
      method: "GET",
      headers: { Accept: "text/markdown, text/plain;q=0.9, */*;q=0.8" },
      cache: "no-store",
      signal: AbortSignal.timeout(ZENROWS_TIMEOUT_MS),
    });
    const requestId = response.headers.get("X-Request-Id");
    const body = await response.text();

    if (!response.ok) {
      const detail = body.replace(/\s+/g, " ").trim().slice(0, 240);
      const suffix = requestId ? ` (ZenRows request ${requestId})` : "";
      if (response.status === 401) {
        return errorResult(target, `ZenRows xác thực thất bại (HTTP 401). Kiểm tra ZENROWS_API_KEY.${suffix}`);
      }
      return errorResult(target, `ZenRows Fetch lỗi HTTP ${response.status}${suffix}${detail ? `: ${detail}` : ""}`);
    }

    const parsed = parseExpediaMarkdown(body);
    // For Expedia, a count alone is a partial crawl: the primary score is missing.
    const success = parsed.ratingValue != null;
    return {
      id: target.id,
      name: target.name,
      url: response.headers.get("Zr-Final-Url") || canonicalUrl.toString(),
      ...parsed,
      rating: parsed.ratingValue == null ? null : parsed.ratingValue.toFixed(1).replace(".", ","),
      capturedAt: new Date().toISOString(),
      success,
      ...(!success ? {
        error: parsed.count == null
          ? "ZenRows trả nội dung nhưng không nhận diện được điểm hoặc số nhận xét Expedia."
          : `Đã nhận diện ${parsed.count} nhận xét nhưng chưa đọc được điểm Expedia.`,
      } : {}),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return errorResult(
      target,
      timedOut ? `ZenRows Fetch vượt quá ${ZENROWS_TIMEOUT_MS / 1000} giây.` : `Không gọi được ZenRows Fetch: ${message}`,
    );
  }
}

export async function runExpediaScraper(targets: ExpediaTarget[]) {
  const results: ExpediaResult[] = [];
  for (const target of targets) {
    results.push(await scrapeExpediaPage(target));
  }
  return {
    success: results.some((result) => result.success),
    totalTargets: targets.length,
    successCount: results.filter((result) => result.success).length,
    results,
  };
}
