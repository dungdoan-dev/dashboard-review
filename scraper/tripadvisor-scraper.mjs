/**
 * scraper/tripadvisor-scraper.mjs
 * ─────────────────────────────────
 * Module cào dữ liệu TripAdvisor bằng Puppeteer.
 * Có thể chạy từ CLI:
 *   node scraper/tripadvisor-scraper.mjs --url "https://www.tripadvisor.com.vn/Hotel_Review-..."
 *   npm run scrape:tripadvisor
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

const PAGE_TIMEOUT = 40_000;
const DELAY_MIN = 1_500;
const DELAY_MAX = 3_500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function scrapeTripadvisorPage(browser, loc) {
  const { id, name, tripadvisorUrl, url: fallbackUrl } = loc;
  const targetUrl = tripadvisorUrl || fallbackUrl;
  console.log(`\n⏳ [${id}] ${name}`);
  console.log(`   ${targetUrl}`);

  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    );
    await page.setViewport({ width: 1280, height: 800 });
    await page.setExtraHTTPHeaders({
      "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    });

    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_TIMEOUT,
    });
    await sleep(4000);

    // Chấp nhận cookies
    try {
      const cookieBtn =
        (await page.$("#onetrust-accept-btn-handler")) ||
        (await page.$('button[aria-label="Chấp nhận tất cả"]')) ||
        (await page.$('button[id*="accept"]'));
      if (cookieBtn) {
        await cookieBtn.click();
        await sleep(1000);
      }
    } catch {
      /* tiếp */
    }

    const extracted = await page.evaluate(() => {
      let ratingStr = null;
      let ratingRawText = null;

      const bubbleEl = document.querySelector(
        '[aria-label*="bong bóng"], [aria-label*="bubble"], [aria-label*="trên 5"], [aria-label*="of 5"]',
      );
      if (bubbleEl) {
        const aria = bubbleEl.getAttribute("aria-label");
        if (aria) {
          const m = aria.match(/(\d)[,.](\d)/);
          if (m) {
            ratingStr = `${m[1]},${m[2]}`;
            ratingRawText = aria;
          }
        }
      }

      if (!ratingStr) {
        const bodyText = document.body.innerText || "";
        const m = bodyText.match(
          /(\d[,.]\d)\s*(?:trên 5|of 5|bong bóng|bubbles)/i,
        );
        if (m) {
          ratingRawText = m[0];
          ratingStr = m[1].replace(".", ",");
        }
      }

      if (!ratingStr) {
        const scoreEls = document.querySelectorAll(
          "div.biGQs, span.biGQs, div.jVDab, span.kJyXc",
        );
        for (const el of scoreEls) {
          const t = el.textContent?.trim() || "";
          if (/^\d[,.]\d$/.test(t)) {
            ratingStr = t.replace(".", ",");
            ratingRawText = t;
            break;
          }
        }
      }

      let countNum = null;
      let countRawText = null;
      const allTextEls = [...document.querySelectorAll("a, span, div, button")];
      for (const el of allTextEls) {
        const t = el.textContent?.trim() || "";
        if (t.length > 0 && t.length < 60) {
          const m = t.match(
            /\(?([\d.,]+)\)?\s*(?:bài đánh giá|đánh giá|nhận xét|reviews?)/i,
          );
          if (m) {
            countRawText = t;
            const cleaned = m[1].replace(/[().,\s]/g, "");
            const n = parseInt(cleaned, 10);
            if (!isNaN(n)) {
              countNum = n;
              break;
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

    const rating = extracted.rating;
    const ratingValue = rating ? parseFloat(rating.replace(",", ".")) : null;
    const count = extracted.count;

    console.log(
      `   🟢 Điểm TripAdvisor : ${rating ?? "—"}  (raw: "${extracted.ratingRaw ?? "không tìm thấy"}")`,
    );
    console.log(
      `   💬 Đánh giá        : ${count != null ? count.toLocaleString("vi-VN") : "—"}  (raw: "${extracted.countRaw ?? "không tìm thấy"}")`,
    );

    return {
      id,
      name,
      url: targetUrl,
      rating,
      ratingValue,
      ratingRaw: extracted.ratingRaw,
      count,
      countRaw: extracted.countRaw,
      capturedAt: new Date().toISOString(),
      success: !!(rating || count !== null),
    };
  } catch (err) {
    console.error(`   ❌ Lỗi: ${err.message}`);
    return {
      id,
      name,
      url: targetUrl,
      rating: null,
      ratingValue: null,
      count: null,
      error: err.message,
      success: false,
    };
  } finally {
    try {
      await page.close();
    } catch {
      /* tiếp */
    }
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
    .eq("platform", "tripadvisor");
  if (error) throw new Error(`Không thể tải link Tripadvisor từ Supabase: ${error.message}`);
  return (data ?? [])
    .filter((row) => row.url?.trim().startsWith("https://"))
    .map((row) => ({ id: row.location_id, name: row.locations.name, tripadvisorUrl: row.url }));
}

async function saveResultsToSupabase(results) {
  const supabase = getSupabase();
  if (!supabase) return 0;
  let saved = 0;
  for (const r of results) {
    if (!r.success) continue;
    const { error } = await supabase.from("metric_snapshots").insert({
      location_id: r.id,
      platform: "tripadvisor",
      rating_scale: 5,
      rating_value: r.ratingValue,
      review_count: r.count,
      count_label: "đánh giá",
      source: "api",
      captured_at: r.capturedAt,
    });
    if (!error) saved++;
    else
      console.warn(
        `   ⚠️ Không thể lưu snapshot TripAdvisor cho [${r.id}]:`,
        error.message,
      );
  }
  return saved;
}

export async function runTripadvisorScraper(options = {}) {
  const headless = options.headless ?? true;
  const save = options.save ?? true;
  let targets = options.targets;

  if (!targets || targets.length === 0) {
    targets = await loadTargetsFromSupabase();
  }

  if (!targets || targets.length === 0) {
    try {
      const targetsPath = resolve(ROOT, "scraper", "targets-tripadvisor.json");
      const content = await readFile(targetsPath, "utf8");
      targets = JSON.parse(content);
    } catch {
      /* tiếp */
    }
  }

  if (!targets || targets.length === 0) {
    return {
      success: false,
      message: "Chưa có cơ sở nào có URL Tripadvisor để cào dữ liệu.",
      results: [],
    };
  }

  console.log(
    `\n🚀 Khởi chạy cào Tripadvisor cho ${targets.length} cơ sở... (headless: ${headless})`,
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
      const result = await scrapeTripadvisorPage(browser, targets[i]);
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
      resolve(outDir, "last-result-tripadvisor.json"),
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
    success: true,
    totalTargets: targets.length,
    successCount: ok.length,
    savedCount,
    results,
  };
}

if (process.argv[1] && process.argv[1].endsWith("tripadvisor-scraper.mjs")) {
  const args = process.argv.slice(2);
  const save = args.includes("--save");
  const headless = !args.includes("--headed");

  let targets = undefined;
  const urlIdx = args.indexOf("--url");
  if (urlIdx !== -1 && args[urlIdx + 1]) {
    targets = [
      {
        id: "cli-target",
        name: "Yzistel Hoi An (TripAdvisor)",
        tripadvisorUrl: args[urlIdx + 1],
      },
    ];
  }

  runTripadvisorScraper({ headless, save, targets })
    .then((res) => {
      console.log("\n📊 Kết quả hoàn thành TripAdvisor:", res);
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error("Fatal:", err);
      process.exitCode = 1;
    });
}
