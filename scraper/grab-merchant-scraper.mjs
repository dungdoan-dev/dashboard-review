/**
 * scraper/grab-merchant-scraper.mjs
 * Đọc điểm và số đánh giá GrabFood từ merchant.grab.com/feedback (cần đăng nhập).
 *   node scraper/grab-merchant-scraper.mjs --all --save                  # cào mọi cơ sở có tài khoản Grab lưu trong database
 *   node scraper/grab-merchant-scraper.mjs --login                       # đăng nhập tay (dùng GRAB_MERCHANT_USER/PASSWORD trong .env), phiên lưu trong scraper/.grab-profile
 *   node scraper/grab-merchant-scraper.mjs --location "Tên cơ sở" --save # một cơ sở, tài khoản lấy từ .env
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { decryptSecret } from "../src/lib/grab-credentials.ts";
import { grabProfileDir, scrapeGrabFeedback } from "../src/lib/scraper/grabfood-scraper.ts";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
async function loadEnv() {
  try {
    for (const line of (await readFile(resolve(ROOT, ".env"), "utf8")).split("\n")) {
      const trimmed = line.trim();
      const idx = trimmed.indexOf("=");
      if (!trimmed || trimmed.startsWith("#") || idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      if (!process.env[key]) process.env[key] = trimmed.slice(idx + 1).trim();
    }
  } catch {
    // Không có .env
  }
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong .env.");
  return createClient(url, key);
}

async function findLocation(supabase, query) {
  const column = /^[0-9a-f-]{36}$/i.test(query) ? "id" : "name";
  const { data, error } = await supabase.from("locations").select("id,name").eq(column, query);
  if (error) throw new Error(`Không đọc được cơ sở: ${error.message}`);
  if (data?.length !== 1) throw new Error(`Cần đúng 1 cơ sở khớp "${query}", tìm thấy ${data?.length ?? 0}.`);
  return data[0];
}

async function saveSnapshot(supabase, locationId, result) {
  const { error } = await supabase.from("metric_snapshots").insert({
    location_id: locationId, platform: "grabfood", rating_scale: 5,
    rating_value: result.ratingValue, review_count: result.count,
    count_label: "đánh giá", source: "api", captured_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Không lưu được snapshot: ${error.message}`);
}

async function main() {
  await loadEnv();
  const args = process.argv.slice(2);
  const login = args.includes("--login");
  const save = args.includes("--save");
  const headless = !(login || args.includes("--headed"));
  const locIdx = args.indexOf("--location");
  const locationQuery = locIdx === -1 ? "" : args[locIdx + 1] ?? "";

  if (args.includes("--all")) {
    // Mỗi cơ sở dùng tài khoản và profile trình duyệt riêng (phiên đăng nhập không lẫn nhau).
    const supabase = getSupabase();
    const { data, error } = await supabase.from("grab_merchant_accounts").select("location_id,username,password_encrypted,locations!inner(name)");
    if (error) throw new Error(`Không đọc được tài khoản Grab: ${error.message}`);
    if (!data?.length) throw new Error("Chưa có cơ sở nào lưu tài khoản Grab. Nhập trong form sửa cơ sở (loại Cà phê & F&B).");
    let failed = 0;
    for (const row of data) {
      const name = row.locations.name;
      try {
        const result = await scrapeGrabFeedback({
          profileDir: grabProfileDir(row.location_id), headless, login,
          user: row.username, password: decryptSecret(row.password_encrypted),
        });
        console.log(`${name}: ${result.ratingValue}/5, ${result.count} đánh giá`);
        if (save) await saveSnapshot(supabase, row.location_id, result);
      } catch (err) {
        failed++;
        console.error(`${name}: LỖI - ${err.message}`);
      }
    }
    console.log(`Xong: ${data.length - failed}/${data.length} cơ sở thành công.`);
    if (failed) process.exitCode = 1;
    return;
  }

  if (save && !locationQuery) throw new Error('--save cần --all hoặc --location "<tên hoặc id cơ sở>".');
  const result = await scrapeGrabFeedback({
    profileDir: grabProfileDir("default"), headless, login,
    user: process.env.GRAB_MERCHANT_USER, password: process.env.GRAB_MERCHANT_PASSWORD,
  });
  console.log(`Grab merchant: ${result.ratingValue}/5, ${result.count} đánh giá`);
  if (!save) return;
  const supabase = getSupabase();
  const location = await findLocation(supabase, locationQuery);
  await saveSnapshot(supabase, location.id, result);
  console.log(`Đã lưu snapshot GrabFood cho "${location.name}".`);
}

if (process.argv[1]?.endsWith("grab-merchant-scraper.mjs")) {
  main().catch((err) => { console.error("Lỗi:", err.message); process.exitCode = 1; });
}
