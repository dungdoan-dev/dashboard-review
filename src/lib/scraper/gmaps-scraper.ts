import { type Browser, type Page } from "puppeteer";
import { launchBrowser } from "./launch-browser";

export interface ScrapeTarget {
  id: string;
  name: string;
  googleUrl: string;
}

export interface ScrapeResult {
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

export interface ScraperOptions {
  headless?: boolean;
  delayMin?: number;
  delayMax?: number;
  timeout?: number;
  onProgress?: (progress: { current: number; total: number; target: ScrapeTarget; result?: ScrapeResult }) => void;
}

const PAGE_TIMEOUT = 35_000;
const DELAY_MIN = 1_500;
const DELAY_MAX = 3_500;

const RATING_SELECTORS = [
  'div[jsaction*="pane.rating"] span.ceNzKf',
  "span.ceNzKf",
  "div.fontDisplayLarge",
  'span[aria-hidden="true"].fontDisplayLarge',
];

const COUNT_SELECTORS = [
  'span[aria-label*="bài đánh giá"]',
  'span[aria-label*="đánh giá"]',
  'span[aria-label*="review"]',
  'span[aria-label*="reviews"]',
  'button[aria-label*="bài đánh giá"]',
  'button[aria-label*="đánh giá"]',
  'button[aria-label*="review"]',
  'button[aria-label*="Reviews"]',
  "span.UY7F9",
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function trySelectors(page: Page, selectors: string[]): Promise<{ sel: string; text: string } | null> {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (!el) continue;
      const text = await page.evaluate(
        (e) => (e.getAttribute("aria-label")?.trim() || e.textContent?.trim()) ?? null,
        el,
      );
      if (text && /\d/.test(text)) return { sel, text };
    } catch {
      // Tiếp tục selector khác
    }
  }
  return null;
}

export function parseRating(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d)[,.](\d)/);
  return m ? `${m[1]},${m[2]}` : null;
}

export function parseCount(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.match(/([\d.,]+)\s*(?:bài đánh giá|đánh giá|reviews?|nhận xét)?/i);
  if (!m) return null;
  const cleaned = m[1].replace(/[().,\s]/g, "");
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? null : n;
}

export async function scrapePage(browser: Browser, loc: ScrapeTarget, timeout = PAGE_TIMEOUT): Promise<ScrapeResult> {
  const { id, name, googleUrl } = loc;
  console.log(`\n⏳ [${id}] ${name}`);
  console.log(`   ${googleUrl}`);

  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    );
    await page.setViewport({ width: 1280, height: 800 });
    await page.setExtraHTTPHeaders({ "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8" });

    await page.goto(googleUrl, { waitUntil: "networkidle2", timeout });
    await sleep(2000);

    // Chấp nhận cookies nếu có banner
    try {
      const acceptBtn =
        (await page.$('button[aria-label="Chấp nhận tất cả"]')) ||
        (await page.$('button[aria-label="Accept all"]')) ||
        (await page.$("form:last-of-type button"));
      if (acceptBtn) {
        await acceptBtn.click();
        await sleep(1200);
      }
    } catch {
      // Bỏ qua
    }

    // Lấy RATING
    let ratingRaw = (await trySelectors(page, RATING_SELECTORS))?.text ?? null;
    if (!ratingRaw) {
      ratingRaw = await page.evaluate(() => {
        const el = document.querySelector(
          '[aria-label*="Được đánh giá"],[aria-label*="Rated"],[aria-label*="sao"]',
        );
        return el?.getAttribute("aria-label") ?? null;
      });
    }

    // Lấy COUNT
    let countRaw = (await trySelectors(page, COUNT_SELECTORS))?.text ?? null;
    if (!countRaw) {
      countRaw = await page.evaluate(() => {
        const btn = [...document.querySelectorAll("button, span")].find((b) =>
          /\d/.test(b.textContent || "") &&
          /đánh giá|review/i.test(b.getAttribute("aria-label") || b.textContent || ""),
        );
        return btn?.getAttribute("aria-label") ?? btn?.textContent?.trim() ?? null;
      });
    }

    const rating = parseRating(ratingRaw);
    const count = parseCount(countRaw);
    const ratingValue = rating ? parseFloat(rating.replace(",", ".")) : null;

    console.log(`   ⭐ Điểm sao  : ${rating ?? "—"} (raw: "${ratingRaw ?? "không tìm thấy"}")`);
    console.log(`   💬 Đánh giá  : ${count != null ? count.toLocaleString("vi-VN") : "—"} (raw: "${countRaw ?? "không tìm thấy"}")`);

    return {
      id,
      name,
      url: googleUrl,
      rating,
      ratingValue,
      ratingRaw,
      count,
      countRaw,
      capturedAt: new Date().toISOString(),
      success: !!(rating || count !== null),
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`   ❌ Lỗi: ${errorMsg}`);
    return {
      id,
      name,
      url: googleUrl,
      rating: null,
      ratingValue: null,
      ratingRaw: null,
      count: null,
      countRaw: null,
      capturedAt: new Date().toISOString(),
      error: errorMsg,
      success: false,
    };
  } finally {
    try {
      await page.close();
    } catch {
      // Ignored
    }
  }
}

export async function runScraper(
  targets: ScrapeTarget[],
  options: ScraperOptions = {},
): Promise<{
  success: boolean;
  totalTargets: number;
  successCount: number;
  results: ScrapeResult[];
  message?: string;
}> {
  const headless = options.headless ?? true;
  const delayMin = options.delayMin ?? DELAY_MIN;
  const delayMax = options.delayMax ?? DELAY_MAX;
  const timeout = options.timeout ?? PAGE_TIMEOUT;

  const validTargets = targets.filter(
    (t) => t.googleUrl && t.googleUrl.trim().startsWith("https://"),
  );

  if (validTargets.length === 0) {
    return {
      success: false,
      totalTargets: 0,
      successCount: 0,
      results: [],
      message: "Không có cơ sở nào có URL Google Maps hợp lệ để cào dữ liệu.",
    };
  }

  console.log(`\n🚀 Khởi chạy cào dữ liệu cho ${validTargets.length} cơ sở... (headless: ${headless})`);

  let browser: Browser | null = null;
  try {
    browser = await launchBrowser({
      headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--lang=vi-VN,vi",
        "--disable-blink-features=AutomationControlled",
      ],
    });

    const results: ScrapeResult[] = [];

    for (let i = 0; i < validTargets.length; i++) {
      const target = validTargets[i];
      if (options.onProgress) {
        options.onProgress({ current: i + 1, total: validTargets.length, target });
      }

      const result = await scrapePage(browser, target, timeout);
      results.push(result);

      if (options.onProgress) {
        options.onProgress({ current: i + 1, total: validTargets.length, target, result });
      }

      if (i < validTargets.length - 1) {
        const delay = delayMin + Math.random() * (delayMax - delayMin);
        await sleep(delay);
      }
    }

    const ok = results.filter((r) => r.success);
    return {
      success: true,
      totalTargets: validTargets.length,
      successCount: ok.length,
      results,
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("❌ Lỗi khi khởi động trình duyệt hoặc cào:", errorMsg);
    return {
      success: false,
      totalTargets: validTargets.length,
      successCount: 0,
      results: [],
      message: `Lỗi cào dữ liệu: ${errorMsg}`,
    };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Ignored
      }
    }
  }
}

