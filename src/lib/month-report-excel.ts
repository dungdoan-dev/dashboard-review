// The Excel file of Báo cáo tháng, three sheets: "Review" (a score table per type of place, like the Tổng quan file), "Tiếp cận" (Google Maps, Facebook, Instagram, Google Analytics, TikTok)
// and "Quảng cáo" (Facebook Ads, Google Ads), the last two laid out like the reach total file. Tests run it with plain Node, so imports use ".ts".
import ExcelJS from "exceljs";
import { addScoreboardSheet, type ScoreTable } from "./scoreboard-excel.ts";
import { addReachSummarySheet } from "./reach-total-excel.ts";
import type { ChannelTables } from "./reach-total.ts";

/** month: "2026-10"; scoreNote / period: the note line of the Review sheet and the "Kỳ: ..." line of the other two; channels: loadReachTotal(...), the advertising ones go to "Quảng cáo". */
export function monthWorkbook(month: string, scoreNote: string, tables: ScoreTable[], period: string, channels: ChannelTables[]) {
  const label = `THÁNG ${month.slice(5, 7)}/${month.slice(0, 4)}`;
  const book = new ExcelJS.Workbook();
  addScoreboardSheet(book, "Review", `BÁO CÁO ${label} · REVIEW`, scoreNote, tables);
  addReachSummarySheet(book, `BÁO CÁO ${label} · TIẾP CẬN`, period, channels.filter((c) => !c.ads), "Tiếp cận");
  addReachSummarySheet(book, `BÁO CÁO ${label} · QUẢNG CÁO`, period, channels.filter((c) => c.ads), "Quảng cáo");
  return book;
}
