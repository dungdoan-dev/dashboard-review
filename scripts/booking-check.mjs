// Room money of one month per booking: Blue Jay weeks stored in Supabase against the accountant's list "DOANH THU KS.". Prints booking codes, nights and money only.
// Usage: node --env-file=.env scripts/booking-check.mjs 5381 2026-08 "<accountant workbook>"
import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";
import fs from "node:fs";

const [hotel, month, file] = [Number(process.argv[2]), process.argv[3], process.argv[4]];
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const from = `${month}-01`, to = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10);
const add = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
const { data } = await db.from("bluejay_revenue_weeks").select("revenue").gte("week_start", add(from, -60)).lte("week_start", add(to, 35));
const key = (c) => String(c).replace(/\s+/g, "").replace(/^0+/, "").toUpperCase();

// ours: the latest snapshot of each booking, room money split evenly over its nights, the nights inside the month
const latest = new Map();
for (const w of data.map((r) => r.revenue).filter((r) => r?.v)) {
  const h = w.hotels.find((x) => x.id === hotel); if (!h) continue;
  for (const [list, ex] of [[h.bookings, false], [h.excluded ?? [], true]]) for (const b of list) {
    const k = `${b.code}|${b.room}|${b.roomType}`, at = w.paymentsAt ?? w.fetchedAt;
    if (!latest.has(k) || at > latest.get(k).at) latest.set(k, { b, at, ex });
  }
}
const ours = new Map();
for (const { b, ex } of latest.values()) {
  if (!b.stay || b.nights <= 0 || !b.checkIn) continue;
  let n = 0;
  for (let i = 0; i < b.nights; i++) { const d = add(b.checkIn, i); if (d >= from && d <= to) n++; }
  if (!n) continue;
  const o = ours.get(key(b.code)) ?? { n: 0, money: 0, ex, info: `${b.room} ${b.roomType} ${b.checkIn}→${b.checkOut} ${b.status} ${b.channel}` };
  o.n += n; o.money += (b.roomPrice / b.nights) * n; ours.set(key(b.code), o);
}
// theirs
const rows = XLSX.utils.sheet_to_json(XLSX.read(fs.readFileSync(file)).Sheets["DOANH THU KS."], { header: 1, defval: "" });
const theirs = new Map();
for (const r of rows.slice(5)) {
  if (typeof r[1] !== "number" || !String(r[7]).trim() || typeof r[11] !== "number") continue;
  const k = key(r[3]), t = theirs.get(k) ?? { n: 0, money: 0, info: `${r[2]} ${r[4]} ${r[5]}→${r[6]} ${r[7]}` };
  t.n += Number(r[9]) || 0; t.money += r[11]; theirs.set(k, t);
}
const all = [...new Set([...ours.keys(), ...theirs.keys()])];
const lines = all.map((k) => ({ k, o: ours.get(k), t: theirs.get(k), diff: (ours.get(k)?.money ?? 0) - (theirs.get(k)?.money ?? 0) }));
const sum = (l, f) => l.reduce((s, x) => s + f(x), 0);
const bucket = (name, l) => console.log(name.padEnd(46), String(l.length).padStart(4), "bookings, money diff", String(Math.round(sum(l, (x) => x.diff))).padStart(12));
console.log("ours", Math.round(sum(lines, (x) => x.o?.money ?? 0)), "theirs", Math.round(sum(lines, (x) => x.t?.money ?? 0)));
bucket("only in the accountant's list", lines.filter((x) => !x.o));
bucket("only in Blue Jay (counted)", lines.filter((x) => !x.t && x.o && !x.o.ex));
bucket("only in Blue Jay (M-Standard/Unassigned, excluded)", lines.filter((x) => !x.t && x.o?.ex));
bucket("in both, same money (±1)", lines.filter((x) => x.o && x.t && Math.abs(x.diff) <= 1));
bucket("in both, different money", lines.filter((x) => x.o && x.t && Math.abs(x.diff) > 1));
console.log("--- largest differences (ours − theirs)");
for (const x of lines.filter((x) => Math.abs(x.diff) > 1).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 30))
  console.log(x.k.padEnd(18), String(Math.round(x.diff)).padStart(11), "| BJ", x.o ? `${x.o.n}n ${Math.round(x.o.money)}${x.o.ex ? " EXCL" : ""}` : "–", "| KT", x.t ? `${x.t.n}n ${x.t.money}` : "–", "|", (x.t ?? x.o).info);
