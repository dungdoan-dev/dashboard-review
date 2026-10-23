import { extractTripadvisorNotice } from "./tripadvisor-notice";
import { decodeHtmlText, extractRankLabel } from "./tripadvisor-rank";

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
  rankLabel: string | null;
  tripadvisorNotice: string | null;
  capturedAt: string;
  success: boolean;
  error?: string;
  status?: number;
}

const ZENROWS_FETCH_ENDPOINT = "https://api.zenrows.com/v1/";
const ZENROWS_TIMEOUT_MS = 180_000;

function parseNumber(value: unknown, max: number): number | null {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value.trim().replace(",", "."))
      : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= max ? parsed : null;
}

function parseCount(value: unknown): number | null {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value.trim().replace(/[,\s.]/g, ""))
      : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function extractJsonLd(html: string): Record<string, unknown>[] {
  const values: Record<string, unknown>[] = [];
  const scripts = html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const script of scripts) {
    try {
      const parsed: unknown = JSON.parse(script[1].replace(/\\u002F/gi, "/"));
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const candidate of candidates) {
        if (candidate && typeof candidate === "object") values.push(candidate as Record<string, unknown>);
      }
    } catch {
      // TripAdvisor also embeds escaped application data; the visible markup is a fallback.
    }
  }
  return values;
}

function findAggregateRating(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.aggregateRating && typeof record.aggregateRating === "object") {
    return record.aggregateRating as Record<string, unknown>;
  }
  if (Array.isArray(record)) {
    for (const item of record) {
      const found = findAggregateRating(item);
      if (found) return found;
    }
  }
  if (record["@graph"]) return findAggregateRating(record["@graph"]);
  return null;
}

function extractAttributeText(html: string, automationId: string): string | null {
  const escapedId = automationId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`<[^>]+data-automation=["']${escapedId}["'][^>]*>([\\s\\S]*?)<\\/`, "i"));
  if (!match) return null;
  return decodeHtmlText(match[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function parseRankLabel(html: string): string | null {
  const clientLinks = html.matchAll(/<a\b[^>]*href=["'][^"']*ClientLink\?value=[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi);
  for (const link of clientLinks) {
    const rankLabel = extractRankLabel(link[1].replace(/<[^>]*>/g, " "));
    if (rankLabel) return rankLabel;
  }

  const visibleText = html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");
  const visibleRank = extractRankLabel(visibleText);
  if (visibleRank) return visibleRank;

  // TripAdvisor sometimes keeps the localized ranking only inside URL-encoded page data.
  const encodedMatch = html.match(/S(?:%5B|%E1%BB%91|ố)[\s\S]{0,180}?Mua[\s\S]{0,80}?(?=\\{3,}|")/i)?.[0];
  if (!encodedMatch) return null;
  try {
    return extractRankLabel(decodeURIComponent(encodedMatch.replace(/\\+/g, "%")));
  } catch {
    return null;
  }
}

function parseTripadvisorHtml(html: string) {
  const aggregate = extractJsonLd(html).map(findAggregateRating).find(Boolean) ?? null;
  const ratingText = aggregate?.ratingValue == null
    ? extractAttributeText(html, "bubbleRatingValue")
    : String(aggregate.ratingValue);
  const countText = aggregate?.reviewCount == null
    ? extractAttributeText(html, "bubbleReviewCount")?.match(/[\d.,]+/)?.[0] ?? null
    : String(aggregate.reviewCount);
  const ratingValue = parseNumber(ratingText, 5);
  const count = parseCount(countText);
  return {
    ratingValue,
    ratingRaw: ratingText,
    count,
    countRaw: countText,
    rankLabel: parseRankLabel(html),
  };
}

function parseTripadvisorMarkdown(markdown: string) {
  const ratingMatch = markdown.match(/([\d]+(?:[.,][\d]+)?)\s+(?:trên|of)\s+5\s+(?:bong bóng|bubbles?)/i)
    ?? markdown.match(/(?:^|\n)\s*([\d]+[.,][\d]+)\s*(?=\n|$)/);
  const countMatch = markdown.match(/\[\(?\s*([\d.,]+)\s+(?:đánh giá|nhận xét|reviews?)\s*\)?\]\s*\(/i)
    ?? markdown.match(/\b([\d.,]+)\s+(?:đánh giá|nhận xét|reviews?)\b/i);
  // Rank links vary by Tripadvisor page type; use only the Markdown link label,
  // stopping at `]` so the destination URL cannot leak into the saved rank text.
  const rankLinkLabels = markdown.matchAll(/\[([^\]]+)\]\([^)]+\)/g);
  let rankLabel: string | null = null;
  for (const link of rankLinkLabels) {
    rankLabel = extractRankLabel(link[1]);
    if (rankLabel) break;
  }
  rankLabel ??= extractRankLabel(markdown);

  const ratingText = ratingMatch?.[1] ?? null;
  const countText = countMatch?.[1] ?? null;
  return {
    ratingValue: parseNumber(ratingText, 5),
    ratingRaw: ratingText,
    count: parseCount(countText),
    countRaw: countText,
    rankLabel,
    tripadvisorNotice: extractTripadvisorNotice(markdown),
  };
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
    rankLabel: null,
    tripadvisorNotice: null,
    capturedAt: new Date().toISOString(),
    success: false,
    error,
    ...(status === undefined ? {} : { status }),
  };
}

async function scrapeTripadvisorTarget(target: TripadvisorTarget, apiKey: string): Promise<TripadvisorResult> {
  try {
    const requestUrl = new URL(ZENROWS_FETCH_ENDPOINT);
    requestUrl.searchParams.set("apikey", apiKey);
    requestUrl.searchParams.set("url", target.tripadvisorUrl);
    requestUrl.searchParams.set("mode", "auto");
    requestUrl.searchParams.set("proxy_country", "vn");
    requestUrl.searchParams.set("original_status", "true");
    requestUrl.searchParams.set("response_type", "markdown");

    const response = await fetch(requestUrl, {
      method: "GET",
      headers: { Accept: "text/markdown, text/plain;q=0.9, */*;q=0.8" },
      cache: "no-store",
      signal: AbortSignal.timeout(ZENROWS_TIMEOUT_MS),
    });
    const body = await response.text();

    const requestId = response.headers.get("X-Request-Id");
    const suffix = requestId ? ` (ZenRows request ${requestId})` : "";

    if (!response.ok) {
      const details = body.replace(/\s+/g, " ").trim().slice(0, 240);
      const prefix = response.status === 401
        ? "ZenRows xác thực thất bại. Kiểm tra ZENROWS_API_KEY."
        : `ZenRows Tripadvisor lỗi HTTP ${response.status}`;
      return errorResult(target, `${prefix}${suffix}${details && response.status !== 401 ? `: ${details}` : ""}`, response.status);
    }

    const markdownParsed = parseTripadvisorMarkdown(body);
    const htmlParsed = parseTripadvisorHtml(body);
    const parsed = markdownParsed.ratingValue != null || markdownParsed.count != null
      ? markdownParsed
      : htmlParsed;
    const success = parsed.ratingValue != null || parsed.count != null;
    return {
      id: target.id,
      name: target.name,
      url: response.headers.get("Zr-Final-Url") || target.tripadvisorUrl,
      ...parsed,
      tripadvisorNotice: markdownParsed.tripadvisorNotice,
      rating: parsed.ratingValue == null ? null : parsed.ratingValue.toFixed(1).replace(".", ","),
      capturedAt: new Date().toISOString(),
      success,
      ...(!success ? { error: "ZenRows trả nội dung nhưng không nhận diện được điểm, số nhận xét hoặc xếp hạng Tripadvisor." } : {}),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return errorResult(
      target,
      timedOut
        ? `ZenRows Fetch vượt quá ${ZENROWS_TIMEOUT_MS / 1000} giây.`
        : `Không gọi được ZenRows Tripadvisor: ${message}`,
    );
  }
}

export async function runTripadvisorScraper(targets: TripadvisorTarget[]) {
  const apiKey = process.env.ZENROWS_API_KEY?.trim();
  if (!apiKey) {
    const results = targets.map((target) => errorResult(
      target,
      "Thiếu ZENROWS_API_KEY. Thêm key ZenRows vào cấu hình môi trường rồi khởi động lại ứng dụng.",
    ));
    return { success: false, totalTargets: targets.length, successCount: 0, results };
  }

  const results: TripadvisorResult[] = [];
  for (const target of targets) {
    let result = await scrapeTripadvisorTarget(target, apiKey);
    // ZenRows hay trả 408/422/5xx tạm thời; thử lại tối đa 2 lần. Không thử lại timeout (180 giây) hay hết hạn mức (402).
    for (let retry = 0; retry < 2 && !result.success && result.status != null && (result.status === 408 || result.status === 422 || result.status === 429 || result.status >= 500); retry++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      result = await scrapeTripadvisorTarget(target, apiKey);
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
