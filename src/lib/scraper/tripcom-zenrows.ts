import type { TripcomResult, TripcomTarget } from "./tripcom-scraper";

const ZENROWS_ENDPOINT = "https://api.zenrows.com/v1/";
const ZENROWS_TIMEOUT_MS = 170_000;

/** Reads the score and review count from the Markdown ZenRows returns for a Trip.com hotel page. */
export function parseTripcomMarkdown(markdown: string): { ratingValue: number | null; count: number | null } {
  // "9.5\n\n/10" (score block) and "377 verified reviews" / "377 đánh giá đã xác minh".
  const rating = markdown.match(/(\d{1,2}[.,]\d)\s*\n+\s*\/\s*10\b/)?.[1] ?? markdown.match(/\b(\d{1,2}[.,]\d)\s*\/\s*10\b/)?.[1];
  const count = markdown.match(/([\d.,]+)\s+(?:verified reviews|đánh giá đã xác minh)/i)?.[1]
    ?? markdown.match(/(?:All|Tất Cả)\s+([\d.,]+)\s+(?:reviews|Đánh Giá)/i)?.[1];
  const ratingValue = rating ? Number(rating.replace(",", ".")) : NaN;
  const countValue = count ? Number(count.replace(/[.,]/g, "")) : NaN;
  return {
    ratingValue: Number.isFinite(ratingValue) && ratingValue >= 0 && ratingValue <= 10 ? ratingValue : null,
    count: Number.isSafeInteger(countValue) ? countValue : null,
  };
}

/** ZenRows has the proxies/browser Trip.com needs; a plain datacenter Chrome gets redirected to the sign-in page. */
export async function fetchTripcomViaZenRows(target: TripcomTarget, apiKey: string): Promise<TripcomResult> {
  const base = { id: target.id, name: target.name, url: target.tripcomUrl, capturedAt: new Date().toISOString() };
  const fail = (error: string): TripcomResult => ({
    ...base, rating: null, ratingValue: null, ratingRaw: null, count: null, countRaw: null, success: false, error,
  });
  try {
    const requestUrl = new URL(ZENROWS_ENDPOINT);
    requestUrl.searchParams.set("apikey", apiKey);
    requestUrl.searchParams.set("url", target.tripcomUrl);
    requestUrl.searchParams.set("mode", "auto");
    requestUrl.searchParams.set("proxy_country", "vn");
    requestUrl.searchParams.set("original_status", "true");
    requestUrl.searchParams.set("response_type", "markdown");
    const response = await fetch(requestUrl, { cache: "no-store", signal: AbortSignal.timeout(ZENROWS_TIMEOUT_MS) });
    const body = await response.text();
    if (!response.ok) {
      const details = body.replace(/\s+/g, " ").trim().slice(0, 200);
      return fail(response.status === 401 ? "ZenRows xác thực thất bại. Kiểm tra ZENROWS_API_KEY." : `ZenRows Trip.com lỗi HTTP ${response.status}: ${details}`);
    }
    const { ratingValue, count } = parseTripcomMarkdown(body);
    if (ratingValue === null && count === null) {
      const signin = /signin/i.test(response.headers.get("zr-final-url") ?? "") ? " (bị chuyển sang trang đăng nhập)" : "";
      return fail(`ZenRows trả trang nhưng không thấy điểm hoặc số đánh giá Trip.com${signin}.`);
    }
    return {
      ...base, rating: ratingValue === null ? null : ratingValue.toFixed(1).replace(".", ","),
      ratingValue, ratingRaw: ratingValue === null ? null : String(ratingValue),
      count, countRaw: count === null ? null : String(count), success: true,
    };
  } catch (error) {
    return fail(`Không gọi được ZenRows Trip.com: ${error instanceof Error ? error.message : String(error)}`);
  }
}
