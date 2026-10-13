/**
 * scraper/booking-scraper.mjs
 * ───────────────────────────
 * Module cào dữ liệu Booking.com bằng Puppeteer.
 * Có thể chạy từ CLI:
 *   node scraper/booking-scraper.mjs --url "https://www.booking.com/hotel/vn/yzistel.vi.html"
 *   npm run scrape:booking
 */

import puppeteer from "puppeteer";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

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
    // Không có .env
  }
}
await loadEnv();

const PAGE_TIMEOUT = 45_000;
const DELAY_MIN = 1_500;
const DELAY_MAX = 3_500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function scrapeBookingPage(browser, loc) {
  const { id, name, bookingUrl, url: fallbackUrl } = loc;
  const targetUrl = bookingUrl || fallbackUrl;
  console.log(`\n⏳ [${id}] ${name}`);
  console.log(`   ${targetUrl}`);

  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1280, height: 800 });
    await page.setExtraHTTPHeaders({
      "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    });

    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT });
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

    const data = await page.evaluate(() => {
      let rating = null;
      let ratingRaw = null;
      let count = null;
      let countRaw = null;

      // 1. Lấy từ JSON-LD
      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      for (const s of scripts) {
        try {
          const json = JSON.parse(s.textContent || "");
          if (json && typeof json === "object") {
            const agg =
              json.aggregateRating ||
              (Array.isArray(json["@graph"])
                ? json["@graph"].find((x) => x?.aggregateRating)?.aggregateRating
                : null);
            if (agg) {
              if (agg.ratingValue != null && !rating) {
                rating = String(agg.ratingValue).replace(".", ",");
                ratingRaw = `json-ld: ${agg.ratingValue}`;
              }
              if (agg.reviewCount != null && count == null) {
                const c = parseInt(String(agg.reviewCount), 10);
                if (!isNaN(c)) {
                  count = c;
                  countRaw = `json-ld: ${agg.reviewCount}`;
                }
              }
            }
          }
        } catch {
          // ignore
        }
      }

      // 2. Lấy từ testid review score
      const scoreComp = document.querySelector('[data-testid="review-score-component"]');
      const rightComp = document.querySelector('[data-testid="review-score-right-component"]');
      const combined = ((scoreComp?.textContent || "") + " " + (rightComp?.textContent || "")).trim();

      if (!rating && combined) {
        const m = combined.match(/(\d{1,2})[,.](\d)/);
        if (m) {
          rating = `${m[1]},${m[2]}`;
          ratingRaw = m[0];
        }
      }

      if (count == null && combined) {
        const m = combined.match(/([\d.,]+)\s*(?:bài đánh giá|đánh giá|nhận xét|reviews?)/i);
        if (m) {
          const num = parseInt(m[1].replace(/[().,\s]/g, ""), 10);
          if (!isNaN(num)) {
            count = num;
            countRaw = m[0];
          }
        }
      }

      // 3. Quét các badge điểm
      if (!rating) {
        const badges = Array.from(document.querySelectorAll(".review-score-badge, [class*='review-score']"));
        for (const el of badges) {
          const txt = el.textContent?.trim() || "";
          const m = txt.match(/^(\d{1,2})[,.](\d)$/);
          if (m) {
            rating = `${m[1]},${m[2]}`;
            ratingRaw = txt;
            break;
          }
        }
      }

      // 4. Quét text đánh giá
      if (count == null) {
        const cand = Array.from(document.querySelectorAll("a, span, div, p"));
        for (const el of cand) {
          const txt = el.textContent?.trim() || "";
          if (txt.includes("đánh giá") || txt.includes("reviews")) {
            const m =
              txt.match(/(?:Đánh giá của khách|\b)\s*\(([\d.,]+)\)/i) ||
              txt.match(/([\d.,]+)\s*(?:bài đánh giá|đánh giá|nhận xét|reviews?)/i);
            if (m) {
              const num = parseInt(m[1].replace(/[().,\s]/g, ""), 10);
              if (!isNaN(num)) {
                count = num;
                countRaw = txt.slice(0, 100);
                break;
              }
            }
          }
        }
      }

      return { rating, ratingRaw, count, countRaw };
    });

    const ratingValue = data.rating ? parseFloat(data.rating.replace(",", ".")) : null;
    const success = data.rating !== null || data.count !== null;

    if (success) {
      console.log(`   🏨 Điểm Booking: ${data.rating ?? "N/A"} / 10  (raw: "${data.ratingRaw}")`);
      console.log(`   💬 Đánh giá    : ${data.count?.toLocaleString("vi-VN") ?? "N/A"}  (raw: "${data.countRaw}")`);
    } else {
      console.log(`   ⚠️  Không tìm thấy điểm số hoặc đánh giá Booking.`);
    }

    return {
      id,
      name,
      url: targetUrl,
      rating: data.rating,
      ratingValue,
      ratingRaw: data.ratingRaw,
      count: data.count,
      countRaw: data.countRaw,
      capturedAt: new Date().toISOString(),
      success,
    };
  } catch (err) {
    console.error(`   ❌ Lỗi khi cào Booking: ${err.message}`);
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
      error: err.message,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function loadTargetsFromSupabase() {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("locations")
    .select("id, name, booking_url")
    .not("booking_url", "is", null);
  if (error || !data) return [];
  return data
    .filter((r) => r.booking_url && r.booking_url.trim().startsWith("https://"))
    .map((r) => ({ id: r.id, name: r.name, bookingUrl: r.booking_url }));
}

async function saveResultsToSupabase(results) {
  const supabase = getSupabase();
  if (!supabase) return 0;
  let saved = 0;
  for (const r of results) {
    if (!r.success) continue;
    const { error } = await supabase.from("metric_snapshots").insert({
      location_id: r.id,
      platform: "booking",
      rating_scale: 10,
      rating_value: r.ratingValue,
      review_count: r.count,
      count_label: "đánh giá",
      source: "api",
      captured_at: r.capturedAt,
    });
    if (!error) saved++;
    else
      console.warn(
        `   ⚠️ Không thể lưu snapshot Booking cho [${r.id}]:`,
        error.message
      );
  }
  return saved;
}

export async function runBookingScraper(options = {}) {
  const headless = options.headless ?? true;
  const save = options.save ?? true;
  let targets = options.targets;

  if (!targets || targets.length === 0) {
    targets = await loadTargetsFromSupabase();
  }

  if (!targets || targets.length === 0) {
    try {
      const targetsPath = resolve(ROOT, "scraper", "targets-booking.json");
      const content = await readFile(targetsPath, "utf8");
      targets = JSON.parse(content);
    } catch {
      /* tiếp */
    }
  }

  if (!targets || targets.length === 0) {
    return {
      success: false,
      message: "Chưa có cơ sở nào có URL Booking.com để cào dữ liệu.",
      results: [],
    };
  }

  console.log(
    `\n🚀 Khởi chạy cào Booking cho ${targets.length} cơ sở... (headless: ${headless})`
  );

  const browser = await puppeteer.launch({
    headless: headless ? "new" : false,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--lang=vi-VN,vi",
    ],
  });

  const results = [];
  try {
    for (let i = 0; i < targets.length; i++) {
      const result = await scrapeBookingPage(browser, targets[i]);
      results.push(result);
      if (i < targets.length - 1) {
        const delay = DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN);
        await sleep(delay);
      }
    }
  } finally {
    try {
      await browser.close();
    } catch {
      /* tiếp */
    }
  }

  const ok = results.filter((r) => r.success);

  try {
    const outDir = resolve(ROOT, "scraper");
    await mkdir(outDir, { recursive: true });
    await writeFile(
      resolve(outDir, "last-result-booking.json"),
      JSON.stringify(results, null, 2),
      "utf8"
    );
  } catch {
    /* tiếp */
  }

  let savedCount = 0;
  if (save && ok.length > 0) {
    savedCount = await saveResultsToSupabase(results);
  }

  return {
    success: ok.length > 0,
    totalTargets: targets.length,
    successCount: ok.length,
    savedCount,
    results,
  };
}

if (process.argv[1] && process.argv[1].endsWith("booking-scraper.mjs")) {
  const args = process.argv.slice(2);
  const headless = !args.includes("--headed");
  const save = args.includes("--save");
  const urlIdx = args.indexOf("--url");

  let targets = null;
  if (urlIdx !== -1 && args[urlIdx + 1]) {
    targets = [
      {
        id: "cli-target",
        name: "Yzistel Hoi An (Booking)",
        url: args[urlIdx + 1],
      },
    ];
  }

  runBookingScraper({ headless, save, targets })
    .then((res) => {
      console.log("\n📊 Kết quả hoàn thành Booking:", res);
      process.exit(res.success ? 0 : 1);
    })
    .catch((err) => {
      console.error("\n❌ Thất bại:", err);
      process.exit(1);
    });
}

