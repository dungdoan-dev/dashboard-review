/**
 * scraper/tripcom-scraper.mjs
 * ───────────────────────────
 * Module cào dữ liệu Trip.com bằng Puppeteer.
 * Có thể chạy từ CLI:
 *   node scraper/tripcom-scraper.mjs --url "https://us.trip.com/hotels/detail/?cityId=1775&hotelId=126921251"
 *   npm run scrape:tripcom
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

export async function scrapeTripcomPage(browser, loc) {
  const { id, name, tripcomUrl, url: fallbackUrl } = loc;
  let targetUrl = tripcomUrl || fallbackUrl;
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

    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_TIMEOUT,
    });
    await sleep(4500);

    // Chấp nhận cookie nếu có
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

      // 1. JSON-LD
      const scripts = Array.from(
        document.querySelectorAll('script[type="application/ld+json"]'),
      );
      for (const s of scripts) {
        try {
          const json = JSON.parse(s.textContent || "");
          if (json && typeof json === "object") {
            const agg =
              json.aggregateRating ||
              (Array.isArray(json["@graph"])
                ? json["@graph"].find((x) => x?.aggregateRating)
                    ?.aggregateRating
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

      // 2. DOM Selectors
      if (!rating || count == null) {
        const reviewNodes = Array.from(
          document.querySelectorAll(
            'div[class*="reviewOverallScores"], div[class*="components_scoreBlock"], div[class*="components_meta"]',
          ),
        );
        for (const node of reviewNodes) {
          const txt = node.textContent?.trim() || "";
          if (!rating) {
            const m = txt.match(/(\d{1,2})[,.](\d)/);
            if (m) {
              rating = `${m[1]},${m[2]}`;
              ratingRaw = m[0];
            }
          }
          if (count == null) {
            const m = txt.match(
              /([\d.,]+)\s*(?:bài đánh giá|đánh giá|nhận xét|reviews?)/i,
            );
            if (m) {
              const n = parseInt(m[1].replace(/[().,\s]/g, ""), 10);
              if (!isNaN(n)) {
                count = n;
                countRaw = m[0];
              }
            }
          }
        }
      }

      // 3. Quét toàn bộ candidates
      if (count == null) {
        const cand = Array.from(document.querySelectorAll("span, div, a, p"));
        for (const el of cand) {
          const txt = el.textContent?.trim() || "";
          if (txt.includes("đánh giá") || txt.includes("reviews")) {
            const m = txt.match(
              /([\d.,]+)\s*(?:bài đánh giá|đánh giá|nhận xét|reviews?)/i,
            );
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

    const ratingValue = data.rating
      ? parseFloat(data.rating.replace(",", "."))
      : null;
    const success = data.rating !== null || data.count !== null;

    if (success) {
      console.log(
        `   🏨 Điểm Trip.com: ${data.rating ?? "N/A"} / 10  (raw: "${data.ratingRaw}")`,
      );
      console.log(
        `   💬 Đánh giá     : ${data.count?.toLocaleString("vi-VN") ?? "N/A"}  (raw: "${data.countRaw}")`,
      );
    } else {
      console.log(`   ⚠️  Không tìm thấy điểm số hoặc đánh giá Trip.com.`);
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
    console.error(`   ❌ Lỗi khi cào Trip.com: ${err.message}`);
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
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Scraper chạy ngoài phiên đăng nhập cần NEXT_PUBLIC_SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY để đọc dữ liệu qua RLS.");
  return createClient(url, key);
}

async function loadTargetsFromSupabase() {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("location_platforms")
    .select("location_id, url, locations!inner(name)")
    .eq("platform", "tripcom");
  if (error) throw new Error(`Không thể tải link Trip.com từ Supabase: ${error.message}`);
  return (data ?? [])
    .filter((row) => row.url?.trim().startsWith("https://"))
    .map((row) => ({ id: row.location_id, name: row.locations.name, tripcomUrl: row.url }));
}

async function saveResultsToSupabase(results) {
  const supabase = getSupabase();
  if (!supabase) return 0;
  let saved = 0;
  for (const r of results) {
    if (!r.success) continue;
    const { error } = await supabase.from("metric_snapshots").insert({
      location_id: r.id,
      platform: "tripcom",
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
        `   ⚠️ Không thể lưu snapshot Trip.com cho [${r.id}]:`,
        error.message,
      );
  }
  return saved;
}

export async function runTripcomScraper(options = {}) {
  const headless = options.headless ?? true;
  const save = options.save ?? true;
  let targets = options.targets;

  if (!targets || targets.length === 0) {
    targets = await loadTargetsFromSupabase();
  }

  if (!targets || targets.length === 0) {
    try {
      const targetsPath = resolve(ROOT, "scraper", "targets-tripcom.json");
      const content = await readFile(targetsPath, "utf8");
      targets = JSON.parse(content);
    } catch {
      /* tiếp */
    }
  }

  if (!targets || targets.length === 0) {
    return {
      success: false,
      message: "Chưa có cơ sở nào có URL Trip.com để cào dữ liệu.",
      results: [],
    };
  }

  console.log(
    `\n🚀 Khởi chạy cào Trip.com cho ${targets.length} cơ sở... (headless: ${headless})`,
  );

  const browser = await puppeteer.launch({
    headless: headless,
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
      const result = await scrapeTripcomPage(browser, targets[i]);
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
      resolve(outDir, "last-result-tripcom.json"),
      JSON.stringify(results, null, 2),
      "utf8",
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

if (process.argv[1] && process.argv[1].endsWith("tripcom-scraper.mjs")) {
  const args = process.argv.slice(2);
  const headless = !args.includes("--headed");
  const save = args.includes("--save");
  const urlIdx = args.indexOf("--url");

  let targets = null;
  if (urlIdx !== -1 && args[urlIdx + 1]) {
    targets = [
      {
        id: "cli-target",
        name: "Yzistel Hoi An (Trip.com)",
        url: args[urlIdx + 1],
      },
    ];
  }

  runTripcomScraper({ headless, save, targets })
    .then((res) => {
      console.log("\n📊 Kết quả hoàn thành Trip.com:", res);
      process.exit(res.success ? 0 : 1);
    })
    .catch((err) => {
      console.error("\n❌ Thất bại:", err);
      process.exit(1);
    });
}
