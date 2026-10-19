/**
 * scraper/bluejay-backfill.mjs
 * Lấy báo cáo vận hành Blue Jay cho nhiều tuần cũ, giống nút "Lấy dữ liệu từ Blue Jay" chạy cho từng tuần.
 *   node scraper/bluejay-backfill.mjs                                  # tuần 1 → 41 năm 2026 (29/12/2025 → 05/10/2026)
 *   node scraper/bluejay-backfill.mjs --from 2026-09-07 --to 2026-10-05
 *   node scraper/bluejay-backfill.mjs --force                          # lấy lại cả các tuần đã có
 * Chỉ chạy được trong khung giờ API (00:00–00:59, 08:00–08:30, 16:00–16:59 giờ VN). Hết giờ thì dừng;
 * chạy lại ở khung sau sẽ tiếp tục từ các tuần còn thiếu (tuần đã lưu được bỏ qua).
 * Mỗi tuần được ghi vào log ở Cài đặt → Đồng bộ Blue Jay (nguồn chạy: script).
 * Cần trong .env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BLUEJAY_API_KEY.
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serviceDb, storedWeeks, syncBusy, syncWeeks } from "../src/lib/bluejay.ts";
import { addDays, isDate, mondayOf } from "../src/lib/bluejay-metrics.ts";

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

const arg = (name) => { const i = process.argv.indexOf(name); return i === -1 ? null : process.argv[i + 1]; };
const fromArg = arg("--from") ?? "2025-12-29"; // thứ Hai của tuần ISO 1 năm 2026
const toArg = arg("--to") ?? "2026-10-05"; // tuần 41: 05–11/10/2026
const force = process.argv.includes("--force");
if (!isDate(fromArg) || !isDate(toArg) || fromArg > toArg) { console.error("--from / --to phải là ngày YYYY-MM-DD, from ≤ to."); process.exit(1); }
const from = mondayOf(fromArg), to = mondayOf(toArg);

await loadEnv();
const db = serviceDb();
if (await syncBusy(db)) { console.error("Đang có một lượt đồng bộ Blue Jay chạy (cron hoặc nút trên web). Chạy lại sau vài phút."); process.exit(1); }
const have = force ? new Set() : await storedWeeks(db, from, to);
const weeks = [];
for (let monday = to; monday >= from; monday = addDays(monday, -7)) if (!have.has(monday)) weeks.push(monday); // mới nhất trước

console.log(`${weeks.length} tuần cần lấy (bỏ qua ${have.size} tuần đã có).`);
const r = await syncWeeks(db, weeks, "script");
if (r.stoppedBy === "window") console.log("Hết khung giờ API. Chạy lại lệnh này ở khung giờ sau để lấy tiếp.");
console.log(`Xong: lấy mới ${r.done}, lỗi ${r.failed}, còn lại ${r.remaining} tuần. Chi tiết từng tuần: Cài đặt → Đồng bộ Blue Jay.`);
process.exit(r.failed ? 1 : 0);
