import { type Browser } from "puppeteer";
import { launchBrowser } from "./launch-browser";
import { fetchTripcomViaZenRows } from "./tripcom-zenrows";

export interface TripcomTarget {
  id: string;
  name: string;
  tripcomUrl: string;
}

export interface TripcomResult {
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

export interface TripcomScraperOptions {
  headless?: boolean;
  delayMin?: number;
  delayMax?: number;
  timeout?: number;
  onProgress?: (progress: {
    current: number;
    total: number;
    target: TripcomTarget;
    result?: TripcomResult;
  }) => void;
}

const PAGE_TIMEOUT = 45_000;
const DELAY_MIN = 1_500;
const DELAY_MAX = 3_500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function parseTripcomRating(raw: string | null): string | null {
  if (!raw) return null;
  const normalized = raw.trim().replace(",", ".");
  if (!/^\d{1,2}(?:\.\d+)?$/.test(normalized)) return null;

  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0 || value > 10) return null;

  return normalized.replace(".", ",");
}

export function parseTripcomCount(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.match(
    /([\d.,]+)\s*(?:bài đánh giá|đánh giá|nhận xét|reviews?)/i,
  );
  if (m) {
    const cleaned = m[1].replace(/[().,\s]/g, "");
    const n = parseInt(cleaned, 10);
    if (!isNaN(n)) return n;
  }
  const m2 = raw.match(/\(([\d.,]+)\)/);
  if (m2) {
    const cleaned = m2[1].replace(/[().,\s]/g, "");
    const n = parseInt(cleaned, 10);
    if (!isNaN(n)) return n;
  }
  return null;
}

export async function scrapeTripcomPage(
  browser: Browser,
  loc: TripcomTarget,
  timeout = PAGE_TIMEOUT,
): Promise<TripcomResult> {
  const { id, name, tripcomUrl } = loc;
  // Chuẩn hóa us.trip.com thành vn.trip.com để tránh bị redirect sang trang đăng nhập
  let targetUrl = tripcomUrl;
  if (targetUrl.includes("us.trip.com")) {
    targetUrl = targetUrl.replace("us.trip.com", "vn.trip.com");
  }

  console.log(`\n⏳ [${id}] ${name}`);
  console.log(`   ${targetUrl}`);

  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    );
    await page.setViewport({ width: 1366, height: 900 });
    await page.setExtraHTTPHeaders({
      "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
      "Sec-Ch-Ua":
        '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
    });

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout });
    await sleep(4500);

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

      // 1. Lấy từ JSON-LD trước (chính xác và đầy đủ nhất trên Trip.com)
      const scripts = Array.from(
        document.querySelectorAll('script[type="application/ld+json"]'),
      );
      for (const s of scripts) {
        try {
          const data = JSON.parse(s.textContent || "");
          if (data && typeof data === "object") {
            const agg =
              data.aggregateRating ||
              (Array.isArray(data["@graph"])
                ? data["@graph"].find((x: unknown) => typeof x === "object" && x !== null && "aggregateRating" in x)
                    ?.aggregateRating
                : null);
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
          // ignore
        }
      }

      // 2. Quét các phần tử DOM đặc trưng của Trip.com
      if (!ratingStr || countNum == null) {
        const reviewNodes = Array.from(
          document.querySelectorAll(
            'div[class*="reviewOverallScores"], div[class*="components_scoreBlock"], div[class*="components_meta"]',
          ),
        );
        for (const node of reviewNodes) {
          const txt = node.textContent?.trim() || "";
          if (!ratingStr) {
            const m = txt.match(/(\d{1,2})[,.](\d)/);
            if (m) {
              ratingStr = `${m[1]},${m[2]}`;
              ratingRawText = m[0];
            }
          }
          if (countNum == null) {
            const m = txt.match(
              /([\d.,]+)\s*(?:bài đánh giá|đánh giá|nhận xét|reviews?)/i,
            );
            if (m) {
              const n = parseInt(m[1].replace(/[().,\s]/g, ""), 10);
              if (!isNaN(n)) {
                countNum = n;
                countRawText = m[0];
              }
            }
          }
        }
      }

      // 3. Quét toàn bộ trang nếu vẫn thiếu
      if (countNum == null) {
        const candidates = Array.from(
          document.querySelectorAll("span, div, a, p"),
        );
        for (const el of candidates) {
          const txt = el.textContent?.trim() || "";
          if (txt.includes("đánh giá") || txt.includes("reviews")) {
            const m = txt.match(
              /([\d.,]+)\s*(?:bài đánh giá|đánh giá|nhận xét|reviews?)/i,
            );
            if (m) {
              const n = parseInt(m[1].replace(/[().,\s]/g, ""), 10);
              if (!isNaN(n)) {
                countNum = n;
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

    const parsedRating = extracted.rating
      ? parseTripcomRating(extracted.rating)
      : null;
    const ratingValue = parsedRating
      ? parseFloat(parsedRating.replace(",", "."))
      : null;

    let finalCount = extracted.count;
    if (finalCount == null && extracted.countRaw) {
      finalCount = parseTripcomCount(extracted.countRaw);
    }

    const success = parsedRating !== null || finalCount !== null;

    if (success) {
      console.log(
        `   🏨 Điểm Trip.com: ${parsedRating ?? "N/A"} / 10  (raw: "${extracted.ratingRaw}")`,
      );
      console.log(
        `   💬 Đánh giá     : ${finalCount?.toLocaleString("vi-VN") ?? "N/A"}  (raw: "${extracted.countRaw}")`,
      );
    } else {
      console.log("   ⚠️  Không tìm thấy điểm số hoặc đánh giá Trip.com.");
    }

    // Khi thất bại, ghi lại trang thực sự nhận được (chặn bot, đăng nhập, chưa tải xong...) để dễ chẩn đoán.
    const diagnostic = success ? null : await page.evaluate(() =>
      `trang: "${document.title.slice(0, 80)}" ${location.host}${location.pathname.slice(0, 60)}; nội dung: "${(document.body?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 160)}"`,
    ).catch(() => "không đọc được trang");

    return {
      id,
      name,
      url: targetUrl,
      rating: parsedRating,
      ratingValue,
      ratingRaw: extracted.ratingRaw,
      count: finalCount,
      countRaw: extracted.countRaw,
      capturedAt: new Date().toISOString(),
      success,
      ...(diagnostic ? { error: `Không tìm thấy điểm hoặc số đánh giá Trip.com (${diagnostic})` } : {}),
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`   ❌ Lỗi khi cào Trip.com: ${errorMessage}`);
    return {
      id,
      name,
      url: targetUrl,
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

export async function runTripcomScraper(
  targets: TripcomTarget[],
  options: TripcomScraperOptions = {},
): Promise<{
  success: boolean;
  totalTargets: number;
  successCount: number;
  results: TripcomResult[];
}> {
  const {
    headless = true,
    delayMin = DELAY_MIN,
    delayMax = DELAY_MAX,
    timeout = PAGE_TIMEOUT,
    onProgress,
  } = options;

  // Trip.com chuyển Chrome từ IP datacenter (Vercel) sang trang đăng nhập; ZenRows có proxy và trình duyệt phù hợp.
  const zenrowsKey = process.env.ZENROWS_API_KEY?.trim();
  if (zenrowsKey) {
    const results: TripcomResult[] = [];
    for (const target of targets) results.push(await fetchTripcomViaZenRows(target, zenrowsKey));
    const successCount = results.filter((r) => r.success).length;
    return { success: successCount > 0, totalTargets: targets.length, successCount, results };
  }


  console.log(
    `\n🚀 Khởi chạy cào Trip.com cho ${targets.length} cơ sở... (headless: ${headless})`,
  );

  const browser = await launchBrowser({
    headless: headless,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-blink-features=AutomationControlled",
      "--lang=vi-VN,vi",
    ],
  });

  const results: TripcomResult[] = [];

  try {
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const result = await scrapeTripcomPage(browser, target, timeout);
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
        const delay =
          Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;
        await sleep(delay);
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const successCount = results.filter((r) => r.success).length;
  console.log(
    `\n✨ Hoàn thành cào Trip.com: ${successCount}/${targets.length} thành công.`,
  );

  return {
    success: successCount > 0,
    totalTargets: targets.length,
    successCount,
    results,
  };
}
