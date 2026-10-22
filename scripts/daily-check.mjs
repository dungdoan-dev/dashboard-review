// Room money of one month per day: the Blue Jay weeks stored in Supabase (what the "Doanh thu theo ngày" page shows) against the accountant's list "DOANH THU KS." (one line per room-night).
// Prints days, counts and money only. Usage: node --env-file=.env scripts/daily-check.mjs 5381 2026-08 "<accountant workbook>"
import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";
import fs from "node:fs";
import { readDailyRevenue } from "../src/lib/bluejay.ts";

const [hotel, month, file] = [Number(process.argv[2]), process.argv[3], process.argv[4]];
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const to = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10);
const ours = (await readDailyRevenue(db, `${month}-01`, to)).hotels.find((h) => h.id === hotel).days;

const rows = XLSX.utils.sheet_to_json(XLSX.read(fs.readFileSync(file)).Sheets["DOANH THU KS."], { header: 1, defval: "" });
const theirs = new Map();
for (const r of rows.slice(5)) {
  if (typeof r[1] !== "number" || !/^tien phong$/.test(String(r[7]).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim())) continue;
  const day = new Date(Date.UTC(1899, 11, 30) + r[1] * 864e5).toISOString().slice(0, 10), t = theirs.get(day) ?? { n: 0, money: 0 };
  t.n += Number(r[9]) || 1; t.money += Number(r[11]) || 0; theirs.set(day, t);
}
let a = 0, b = 0;
console.log("day        BJ rooms  BJ room money | KT nights  KT money   | diff money | BJ excluded rooms/money");
for (const d of ours) {
  const t = theirs.get(d.date) ?? { n: 0, money: 0 };
  a += d.room; b += t.money;
  console.log(d.date, String(d.rooms).padStart(5), String(Math.round(d.room)).padStart(13), "|", String(t.n).padStart(6), String(t.money).padStart(12), "|", String(Math.round(d.room - t.money)).padStart(11), "|", d.excludedRooms, Math.round(d.excludedRoom));
}
console.log("total BJ", Math.round(a), "KT", b, "diff", Math.round(a - b));
