/**
 * scraper/gmaps-scraper.mjs
 * ─────────────────────────
 * Module cào dữ liệu Google Maps bằng Puppeteer, mặc định chạy ẩn (headless).
 * Đã tích hợp cho project E:\dashboad-review.
 *
 * Cách chạy:
 *   CLI:   `npm run scrape`
 *          `node scraper/gmaps-scraper.mjs --save`
 *          `node scraper/gmaps-scraper.mjs --headed` để mở cửa sổ trình duyệt.
 *   API:   import { runScraper } from "./gmaps-scraper.mjs" hoặc "@/lib/scraper/gmaps-scraper"
 */

import puppeteer from "puppeteer";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// Đọc .env nếu có
async function loadEnv() {
  try {
    const envPath = resolve(ROOT, ".env");
    const content = await readFile(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  } catch {
    // Không có file .env
  }
}
await loadEnv();

// ─── Config ──────────────────────────────────────────────────────────────────
const PAGE_TIMEOUT = 35_000;
const DELAY_MIN    = 1_500;
const DELAY_MAX    = 3_500;

// ─── Selectors ───────────────────────────────────────────────────────────────
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

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function trySelectors(page, selectors) {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (!el) continue;
      const text = await page.evaluate(e =>
        (e.getAttribute("aria-label")?.trim() || e.textContent?.trim()) ?? null, el);
      if (text && /\d/.test(text)) return { sel, text };
    } catch { /* tiếp */ }
  }
  return null;
}

export function parseRating(raw) {
  if (!raw) return null;
  const m = raw.match(/(\d)[,.](\d)/);
  return m ? `${m[1]},${m[2]}` : null;
}

export function parseCount(raw) {
  if (!raw) return null;
  const m = raw.match(/([\d\.,]+)\s*(?:bài đánh giá|đánh giá|reviews?|nhận xét)?/i);
  if (!m) return null;
  const cleaned = m[1].replace(/[\(\)\.,\s]/g, "");
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? null : n;
}

// ─── Scrape một trang ────────────────────────────────────────────────────────
export async function scrapePage(browser, loc) {
  const { id, name, googleUrl, gmapsUrl } = loc;
  const url = googleUrl || gmapsUrl;
  console.log(`\n⏳ [${id}] ${name}`);
  console.log(`   ${url}`);

  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1280, height: 800 });
    await page.setExtraHTTPHeaders({ "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8" });

    await page.goto(url, { waitUntil: "networkidle2", timeout: PAGE_TIMEOUT });
    await sleep(2000);

    // Chấp nhận cookies nếu có
    try {
      const acceptBtn =
        await page.$('button[aria-label="Chấp nhận tất cả"]') ||
        await page.$('button[aria-label="Accept all"]') ||
        await page.$("form:last-of-type button");
      if (acceptBtn) { await acceptBtn.click(); await sleep(1200); }
    } catch { /* bỏ qua */ }

    // ── Lấy RATING ──
    let ratingRaw = (await trySelectors(page, RATING_SELECTORS))?.text ?? null;
    if (!ratingRaw) {
      ratingRaw = await page.evaluate(() => {
        const el = document.querySelector(
          '[aria-label*="Được đánh giá"],[aria-label*="Rated"],[aria-label*="sao"]'
        );
        return el?.getAttribute("aria-label") ?? null;
      });
    }

    // ── Lấy COUNT ──
    let countRaw = (await trySelectors(page, COUNT_SELECTORS))?.text ?? null;
    if (!countRaw) {
      countRaw = await page.evaluate(() => {
        const btn = [...document.querySelectorAll("button, span")].find(b =>
          /\d/.test(b.textContent || "") &&
          /đánh giá|review/i.test(b.getAttribute("aria-label") || b.textContent || "")
        );
        return btn?.getAttribute("aria-label") ?? btn?.textContent?.trim() ?? null;
      });
    }

    const rating = parseRating(ratingRaw);
    const count  = parseCount(countRaw);
    const ratingValue = rating ? parseFloat(rating.replace(",", ".")) : null;

    console.log(`   ⭐ Điểm sao  : ${rating ?? "—"}  (raw: "${ratingRaw ?? "không tìm thấy"}")`);
    console.log(`   💬 Đánh giá  : ${count != null ? count.toLocaleString("vi-VN") : "—"}  (raw: "${countRaw ?? "không tìm thấy"}")`);

    return {
      id, name, url,
      rating,
      ratingValue,
      ratingRaw,
      count,
      countRaw,
      capturedAt: new Date().toISOString(),
      success: !!(rating || count !== null),
    };

  } catch (err) {
    console.error(`   ❌ Lỗi: ${err.message}`);
    return { id, name, url, rating: null, ratingValue: null, count: null, error: err.message, success: false };
  } finally {
    try {
      await page.close();
    } catch { /* bỏ qua */ }
  }
}

// ─── Tương tác Supabase ─────────────────────────────────────────────────────
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function loadTargetsFromSupabase() {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("locations")
    .select("id, name, google_url")
    .not("google_url", "is", null);
  if (error || !data) return [];
  return data
    .filter(r => r.google_url && r.google_url.trim().startsWith("https://"))
    .map(r => ({ id: r.id, name: r.name, googleUrl: r.google_url }));
}

async function saveResultsToSupabase(results) {
  const supabase = getSupabase();
  if (!supabase) return 0;
  let saved = 0;
  for (const r of results) {
    if (!r.success) continue;
    const { error } = await supabase.from("metric_snapshots").insert({
      location_id: r.id,
      platform: "google",
      rating_scale: 5,
      rating_value: r.ratingValue,
      review_count: r.count,
      count_label: "đánh giá",
      source: "api",
      captured_at: r.capturedAt,
    });
    if (!error) saved++;
    else console.warn(`   ⚠️ Không thể lưu snapshot cho [${r.id}]:`, error.message);
  }
  return saved;
}

// ─── Main Scraper Runner Function ────────────────────────────────────────────
export async function runScraper(options = {}) {
  const headless = options.headless ?? true;
  const save     = options.save ?? true;
  let targets    = options.targets;

  if (!targets || targets.length === 0) {
    targets = await loadTargetsFromSupabase();
  }

  // Nếu vẫn không có targets (chưa kết nối DB hoặc DB rỗng), kiểm tra file last-targets hoặc demo
  if (!targets || targets.length === 0) {
    try {
      const targetsPath = resolve(ROOT, "scraper", "targets.json");
      const content = await readFile(targetsPath, "utf8");
      targets = JSON.parse(content);
    } catch {
      // Bỏ qua
    }
  }

  if (!targets || targets.length === 0) {
    return {
      success: false,
      message: "Chưa có cơ sở nào có URL Google Maps để cào dữ liệu.",
      results: []
    };
  }

  console.log(`\n🚀 Khởi chạy cào dữ liệu cho ${targets.length} cơ sở... (headless: ${headless})`);

  const browser = await puppeteer.launch({
    headless: headless,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--lang=vi-VN,vi",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  const results = [];
  try {
    for (let i = 0; i < targets.length; i++) {
      const result = await scrapePage(browser, targets[i]);
      results.push(result);
      if (i < targets.length - 1) {
        const delay = DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN);
        await sleep(delay);
      }
    }
  } finally {
    try {
      await browser.close();
    } catch { /* bỏ qua */ }
  }

  const ok = results.filter(r => r.success);

  // Lưu file kết quả JSON
  try {
    const outDir = resolve(ROOT, "scraper");
    await mkdir(outDir, { recursive: true });
    await writeFile(resolve(outDir, "last-result.json"), JSON.stringify(results, null, 2), "utf8");
  } catch { /* bỏ qua */ }

  let savedCount = 0;
  if (save && ok.length > 0) {
    savedCount = await saveResultsToSupabase(results);
  }

  return {
    success: true,
    totalTargets: targets.length,
    successCount: ok.length,
    savedCount,
    results
  };
}

// Chạy trực tiếp qua CLI: `node scraper/gmaps-scraper.mjs`
if (process.argv[1] && process.argv[1].endsWith("gmaps-scraper.mjs")) {
  const args     = process.argv.slice(2);
  const save     = args.includes("--save");
  const headless = !args.includes("--headed");

  let targets = undefined;
  const urlIdx = args.indexOf("--url");
  if (urlIdx !== -1 && args[urlIdx + 1]) {
    targets = [{
      id: "cli-target",
      name: "Địa điểm chỉ định từ CLI",
      googleUrl: args[urlIdx + 1]
    }];
  }

  runScraper({ headless, save, targets })
    .then(res => {
      console.log("\n📊 Kết quả hoàn thành:", res);
      process.exitCode = 0;
    })
    .catch(err => {
      console.error("Fatal:", err);
      process.exitCode = 1;
    });
}
