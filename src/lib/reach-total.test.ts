import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { CHANNELS, REACH_MAX_DAYS, spanDays, type ChannelTables } from "./reach-total.ts";
import { reachTotalWorkbook } from "./reach-total-excel.ts";

const channel = (key: string) => CHANNELS.find((c) => c.key === key)!;
const facebook = channel("facebook").build({
  pages: [{ id: "1", name: "Sontra", views: 100, viewers: 60, engagement: 10, visits: 5, follows: 2, posts: 3 }, { id: "2", name: "Gia Lai", views: 50, viewers: 20, engagement: 4, visits: 1, follows: 0, posts: 1 }],
  daily: [{ day: "2026-10-02", id: "1", name: "Sontra", views: 60, engagement: 6, visits: 3, follows: 1 }],
});
const ga = channel("google-analytics").build({
  sites: [{ id: "a", site: "vjh.vn", sessions: 10, users: 8, newUsers: 5, engagedSessions: 6, engagementRate: 0.6, views: 20, conversions: 1 }],
  channels: [], daily: [],
});

test("each channel builds its tables with the columns of its page; ratios and people do not add up", () => {
  assert.deepEqual(facebook.summary[0].head, ["Trang", "Lượt xem", "Người xem", "Lượt tương tác", "Lượt truy cập", "Lượt theo dõi", "Số post bài"]);
  assert.deepEqual(facebook.summary[0].rows[0], ["Sontra", 100, 60, 10, 5, 2, 3]);
  assert.deepEqual(facebook.summary[0].sum, [false, true, false, true, true, true, true]); // "Người xem" counts people over the range
  assert.deepEqual(facebook.daily.rows[0].slice(0, 3), ["02/10/2026", "Sontra", 60]);
  assert.deepEqual(ga.summary.map((b) => b.title), ["Google Analytics · theo website", "Google Analytics · theo nguồn"]);
  assert.equal(ga.summary[0].sum[ga.summary[0].head.indexOf("Tỷ lệ tương tác")], false);
  assert.deepEqual(CHANNELS.map((c) => c.name), ["Google Maps", "Facebook", "Instagram", "Google Analytics", "TikTok", "Facebook Ads", "Google Ads"]);
  assert.deepEqual([REACH_MAX_DAYS, channel("tiktok").maxDays, spanDays("2026-10-01", "2026-10-31")], [120, 60, 31]);
});

test("a body without the lists gives empty tables, not a crash", () => {
  for (const c of CHANNELS) { const t = c.build({}); assert.ok(t.summary.every((b) => b.rows.length === 0) && t.daily.rows.length === 0, c.key); }
});

const tables: ChannelTables[] = [
  { name: "Facebook", ...facebook },
  { name: "Google Analytics", ...ga },
  { name: "TikTok", summary: [], daily: null, error: "Khoảng ngày vượt quá 60 ngày của kênh này." },
];

test("the workbook has a ruled Tổng hợp sheet with a block per table, a total row, the error of a channel, and a sheet of days per channel with data", async () => {
  const book = reachTotalWorkbook("BÁO CÁO TỔNG TIẾP CẬN", "Kỳ: 01/10/2026 – 31/10/2026", tables);
  assert.deepEqual(book.worksheets.map((w) => w.name), ["Tổng hợp", "Facebook theo ngày"]);
  const ws = book.getWorksheet("Tổng hợp")!;
  const col1 = (ws.getColumn(1).values as unknown[]).slice(1);
  assert.deepEqual(col1.slice(0, 2), ["BÁO CÁO TỔNG TIẾP CẬN", "Kỳ: 01/10/2026 – 31/10/2026"]);
  const at = (text: string) => col1.indexOf(text) + 1;
  assert.ok(at("Facebook · theo trang") > 0 && at("Google Analytics · theo nguồn") > at("Google Analytics · theo website"));
  const head = at("Facebook · theo trang") + 1;
  assert.deepEqual([ws.getCell(head, 1).value, ws.getCell(head + 1, 2).value, ws.getCell(head + 3, 1).value, ws.getCell(head + 3, 2).value, ws.getCell(head + 3, 3).value], ["Trang", 100, "Tổng", 150, null]);
  assert.equal(ws.getCell(head + 3, 1).font?.bold, true);
  assert.equal(ws.getCell(head + 1, 2).numFmt, "#,##0");
  const gaHead = at("Google Analytics · theo website") + 1, rate = ws.getRow(gaHead).values as unknown[];
  assert.equal(ws.getCell(gaHead + 1, rate.indexOf("Tỷ lệ tương tác")).numFmt, "0.00%");
  assert.equal(ws.getCell(at("TikTok") + 1, 1).value, "Khoảng ngày vượt quá 60 ngày của kênh này.");
  assert.equal(ws.getCell(head + 1, 2).border?.top?.style, "thin");
  const days = book.getWorksheet("Facebook theo ngày")!;
  assert.deepEqual([(days.getRow(2).values as unknown[]).slice(1, 4), days.getCell(3, 1).value, days.getCell(3, 3).value], [["Ngày", "Trang", "Lượt xem"], "02/10/2026", 60]);
  const back = new ExcelJS.Workbook();
  await back.xlsx.load((await book.xlsx.writeBuffer()) as unknown as ArrayBuffer);
  assert.equal(back.worksheets.length, 2);
});
