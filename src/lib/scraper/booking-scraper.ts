import puppeteer, { type Browser } from "puppeteer";

export interface BookingTarget {
  id: string;
  name: string;
  bookingUrl: string;
}

export interface BookingResult {
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

export interface BookingScraperOptions {
  headless?: boolean;
  delayMin?: number;
  delayMax?: number;
  timeout?: number;
  onProgress?: (progress: { current: number; total: number; target: BookingTarget; result?: BookingResult }) => void;
}

const PAGE_TIMEOUT = 45_000;
const DELAY_MIN = 1_500;
const DELAY_MAX = 3_500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function parseBookingRating(raw: string | null): string | null {
  if (!raw) return null;
  const normalized = raw.trim().replace(",", ".");
  if (!/^\d{1,2}(?:\.\d+)?$/.test(normalized)) return null;

  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0 || value > 10) return null;

  return normalized.replace(".", ",");
}

export function parseBookingCount(raw: string | null): number | null {
  if (!raw) return null;
  // Match "176 đánh giá" or "1.021 đánh giá"
  const m1 = raw.match(/([\d.,]+)\s*(?:bài đánh giá|đánh giá|nhận xét|reviews?)/i);
  if (m1) {
    const cleaned = m1[1].replace(/[().,\s]/g, "");
    const n = parseInt(cleaned, 10);
    if (!isNaN(n)) return n;
  }
  // Match "(176)" or "(1,021)"
  const m2 = raw.match(/\(([\d.,]+)\)/);
  if (m2) {
    const cleaned = m2[1].replace(/[().,\s]/g, "");
    const n = parseInt(cleaned, 10);
    if (!isNaN(n)) return n;
  }
  return null;
}

export async function scrapeBookingPage(
  browser: Browser,
  loc: BookingTarget,
  timeout = PAGE_TIMEOUT,
): Promise<BookingResult> {
  const { id, name, bookingUrl } = loc;
  console.log(`\n⏳ [${id}] ${name}`);
  console.log(`   ${bookingUrl}`);

  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    );
    await page.setViewport({ width: 1280, height: 800 });
    await page.setExtraHTTPHeaders({
      "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    });

    await page.goto(bookingUrl, { waitUntil: "domcontentloaded", timeout });
    await sleep(4000);

    // Chấp nhận cookies / popup nếu có
    try {
      const cookieBtn =
        (await page.$("#onetrust-accept-btn-handler")) ||
        (await page.$('button[id*="accept"]')) ||
        (await page.$('button[aria-label*="Chấp nhận"]'));
      if (cookieBtn) {
        await cookieBtn.click();
        await sleep(1000);
      }
    } catch {
      // Bỏ qua
    }

    const extracted = await page.evaluate(() => {
      let ratingStr: string | null = null;
      let ratingRawText: string | null = null;
      let countNum: number | null = null;
      let countRawText: string | null = null;

      // 1. Thử lấy từ JSON-LD trước (rất chuẩn trên Booking.com)
      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      for (const s of scripts) {
        try {
          const data = JSON.parse(s.textContent || "");
          if (data && typeof data === "object") {
            const graphNode = Array.isArray(data["@graph"])
              ? data["@graph"].find((x: unknown) => typeof x === "object" && x !== null && "aggregateRating" in x)
              : null;
            const agg = data.aggregateRating || (graphNode && typeof graphNode === "object" ? graphNode.aggregateRating : null);
            if (agg) {
              if (agg.ratingValue != null && !ratingStr) {
                const val = String(agg.ratingValue).replace(".", ",");
                ratingStr = val;
                ratingRawText = `json-ld: ${agg.ratingValue}`;
              }
              if (agg.reviewCount != null && countNum == null) {
                const c = parseInt(String(agg.reviewCount), 10);
                if (!isNaN(c)) {
                  countNum = c;
                  countRawText = `json-ld: ${agg.reviewCount}`;
                }
              }
            }
          }
        } catch {
          // ignore json parse error
        }
      }

      // 2. Thử selector testid của Booking.com
      const scoreComponent = document.querySelector('[data-testid="review-score-component"]');
      const rightComponent = document.querySelector('[data-testid="review-score-right-component"]');
      
      const combinedText = (scoreComponent?.textContent || "") + " " + (rightComponent?.textContent || "");

      if (!ratingStr && combinedText) {
        const m = combinedText.match(/(\d{1,2})[,.](\d)/);
        if (m) {
          ratingStr = `${m[1]},${m[2]}`;
          ratingRawText = m[0];
        }
      }

      if (countNum == null && combinedText) {
        const m = combinedText.match(/([\d.,]+)\s*(?:bài đánh giá|đánh giá|nhận xét|reviews?)/i);
        if (m) {
          const num = parseInt(m[1].replace(/[().,\s]/g, ""), 10);
          if (!isNaN(num)) {
            countNum = num;
            countRawText = m[0];
          }
        }
      }

      // 3. Quét các phần tử badge điểm độc lập nếu chưa có
      if (!ratingStr) {
        const badgeElements = Array.from(document.querySelectorAll(".review-score-badge, [class*='review-score']"));
        for (const el of badgeElements) {
          const txt = el.textContent?.trim() || "";
          const m = txt.match(/^(\d{1,2})[,.](\d)$/);
          if (m) {
            ratingStr = `${m[1]},${m[2]}`;
            ratingRawText = txt;
            break;
          }
        }
      }

      // 4. Quét phần tử có chữ "Đánh giá của khách (176)" nếu chưa có count
      if (countNum == null) {
        const allCandidates = Array.from(document.querySelectorAll("a, span, div, p"));
        for (const el of allCandidates) {
          const txt = el.textContent?.trim() || "";
          if (txt.includes("đánh giá") || txt.includes("reviews")) {
            const m = txt.match(/(?:Đánh giá của khách|\b)\s*\(([\d.,]+)\)/i) ||
                      txt.match(/([\d.,]+)\s*(?:bài đánh giá|đánh giá|nhận xét|reviews?)/i);
            if (m) {
              const num = parseInt(m[1].replace(/[().,\s]/g, ""), 10);
              if (!isNaN(num)) {
                countNum = num;
                countRawText = txt.slice(0, 100);
                break;
              }
            }
          }
        }
      }

      return {
        rating: ratingStr,
        ratingRaw: ratingRawText,
        count: countNum,
        countRaw: countRawText,
      };
    });

    const parsedRating = extracted.rating ? parseBookingRating(extracted.rating) : null;
    const ratingValue = parsedRating ? parseFloat(parsedRating.replace(",", ".")) : null;

    let finalCount = extracted.count;
    if (finalCount == null && extracted.countRaw) {
      finalCount = parseBookingCount(extracted.countRaw);
    }

    const success = parsedRating !== null || finalCount !== null;

    if (success) {
      console.log(`   🏨 Điểm Booking : ${parsedRating ?? "N/A"} / 10  (raw: "${extracted.ratingRaw}")`);
      console.log(`   💬 Đánh giá     : ${finalCount?.toLocaleString("vi-VN") ?? "N/A"}  (raw: "${extracted.countRaw}")`);
    } else {
      console.log("   ⚠️  Không tìm thấy điểm số hoặc đánh giá Booking.");
    }

    return {
      id,
      name,
      url: bookingUrl,
      rating: parsedRating,
      ratingValue,
      ratingRaw: extracted.ratingRaw,
      count: finalCount,
      countRaw: extracted.countRaw,
      capturedAt: new Date().toISOString(),
      success,
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`   ❌ Lỗi khi cào Booking: ${errorMessage}`);
    return {
      id,
      name,
      url: bookingUrl,
      rating: null,
      ratingValue: null,
      ratingRaw: null,
      count: null,
      countRaw: null,
      capturedAt: new Date().toISOString(),
      success: false,
      error: errorMessage,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

export async function runBookingScraper(
  targets: BookingTarget[],
  options: BookingScraperOptions = {},
): Promise<{
  success: boolean;
  totalTargets: number;
  successCount: number;
  results: BookingResult[];
}> {
  const {
    headless = true,
    delayMin = DELAY_MIN,
    delayMax = DELAY_MAX,
    timeout = PAGE_TIMEOUT,
    onProgress,
  } = options;

  console.log(`\n🚀 Khởi chạy cào Booking cho ${targets.length} cơ sở... (headless: ${headless})`);

  const browser = await puppeteer.launch({
    headless: headless,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--lang=vi-VN,vi",
    ],
  });

  const results: BookingResult[] = [];

  try {
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const result = await scrapeBookingPage(browser, target, timeout);
      results.push(result);

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: targets.length,
          target,
          result,
        });
      }

      if (i < targets.length - 1) {
        const delay = Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;
        await sleep(delay);
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const successCount = results.filter((r) => r.success).length;
  console.log(`\n✨ Hoàn thành cào Booking: ${successCount}/${targets.length} thành công.`);

  return {
    success: successCount > 0,
    totalTargets: targets.length,
    successCount,
    results,
  };
}
