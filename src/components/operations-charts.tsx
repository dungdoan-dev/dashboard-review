"use client";

import { fmtDate } from "@/lib/format-date";
import { Donut, ShareTiles, entityColors } from "@/components/dashboard-charts";
import { ROOM, SERVICE, Stacked, type Series } from "@/components/bluejay-revenue-charts";
import { REPORT_GROUPS } from "@/lib/finance-summary";

// The charts at the top of the Vận hành pages (revenue by day, hotel comparison, cash in and out, yearly result, stock). Each takes the numbers the page already has, so the charts and tables never disagree.

const pct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;
const LINES: Series[] = [{ key: "room", name: "Tiền phòng", color: ROOM }, { key: "minibar", name: "Minibar", color: SERVICE }, { key: "outside", name: "Dịch vụ ngoài", color: "#1baf7a" }, { key: "laundry", name: "Giặt ủi", color: "#b0479a" }, { key: "other", name: "Thu khác", color: "#b4b4be" }];
const dm = (date: string) => fmtDate(date).slice(0, 5);
const STOCK_ORDER = ["minibar", "amenities", "vat tu", "do vai", "nguyen lieu cafe", "nguyen lieu an sang"]; // the kho kinds (KHO_KINDS), so a kind keeps its colour

function Card({ title, note, wide, children }: { title: string; note?: string; wide?: boolean; children: React.ReactNode }) {
  return <article className={`summary-chart${wide ? " wide" : ""}`}><h4>{title}</h4>{note && <p className="summary-note">{note}</p>}{children}</article>;
}

/** Doanh thu theo ngày: room and service money per check-out day, and their share. */
export function DailyCharts({ days }: { days: { date: string; room: number; service: number }[] }) {
  const room = days.reduce((s, d) => s + d.room, 0), service = days.reduce((s, d) => s + d.service, 0);
  if (room + service <= 0) return null;
  return <div className="summary-grid">
    <Card title="Tiền phòng và dịch vụ theo ngày trả phòng" wide>
      <Stacked data={days.map((d) => ({ x: dm(d.date), room: d.room, service: d.service }))} series={[{ key: "room", name: "Tiền phòng", color: ROOM }, { key: "service", name: "Dịch vụ", color: SERVICE }]} label="Tiền phòng và dịch vụ theo ngày trả phòng" />
    </Card>
    <Card title="Cơ cấu doanh thu" note="Tỷ trọng tiền phòng và tiền dịch vụ trong kỳ.">
      <ShareTiles items={[{ name: "Tiền phòng", value: room }, { name: "Dịch vụ", value: service }]} />
    </Card>
  </div>;
}

type CompareRow = { week: string; hotel: string; chain: boolean; occ: number | null; room: number; minibar: number; outside: number; laundry: number; other: number };

/** So sánh khách sạn: occupancy and revenue lines per hotel for the month, and the chain's revenue lines week by week. */
export function CompareCharts({ rows }: { rows: CompareRow[] }) {
  const hotels = rows.filter((r) => r.week === "Cả tháng" && !r.chain);
  const weeks = rows.filter((r) => r.week !== "Cả tháng" && r.chain);
  if (hotels.length === 0) return null;
  const lines = (r: CompareRow) => ({ room: r.room, minibar: r.minibar, outside: r.outside, laundry: r.laundry, other: r.other });
  return <div className="summary-grid">
    <Card title="Công suất (OCC) theo khách sạn" note="Cả tháng, theo công suất đã lưu.">
      <Stacked horizontal fmt={pct} axis={(v) => `${v}%`} valueLabel={pct} data={hotels.map((r) => ({ x: r.hotel, occ: r.occ === null ? null : r.occ * 100 }))} series={[{ key: "occ", name: "Công suất", color: ROOM }]} label="Công suất theo khách sạn" />
    </Card>
    <Card title="Doanh thu theo khách sạn" note="Cả tháng, theo từng loại doanh thu (trước giảm trừ).">
      <Stacked horizontal data={hotels.map((r) => ({ x: r.hotel, ...lines(r) }))} series={LINES} label="Doanh thu theo khách sạn" />
    </Card>
    {weeks.length > 1 && <Card title="Doanh thu toàn chuỗi theo tuần" wide>
      <Stacked data={weeks.map((r) => ({ x: r.week, ...lines(r) }))} series={LINES} label="Doanh thu toàn chuỗi theo tuần" />
    </Card>}
  </div>;
}

/** Thu chi: money in and out per day, and the cost groups' share. */
export function FinanceCharts({ days, groups }: { days: { date: string; income: number; expense: number }[]; groups: { group: string; total: number }[] }) {
  const costs = groups.filter((g) => g.total > 0), groupColors = entityColors(costs.map((g) => g.group), REPORT_GROUPS);
  if (days.length === 0 && costs.length === 0) return null;
  return <div className="summary-grid">
    <Card title="Thu và chi theo ngày" wide>
      <Stacked grouped data={days.map((d) => ({ x: dm(d.date), income: d.income, expense: d.expense }))} series={[{ key: "income", name: "Thu của khách", color: ROOM }, { key: "expense", name: "Chi", color: SERVICE }]} label="Thu và chi theo ngày" />
    </Card>
    {costs.length > 0 && <Card title="Cơ cấu chi" note="Tỷ trọng các nhóm chi trong tháng, không tính điều chuyển.">
      <Donut width="100%" animate={false} unit="đ" slices={costs.map((g) => ({ name: g.group, value: g.total, color: groupColors.get(g.group)! }))} />
    </Card>}
  </div>;
}

type Month = { m: string; occ: number | null; room: number; minibar: number; outside: number; laundry: number; other: number };

/** Kết quả HĐKD: revenue lines and occupancy month by month. */
export function PnlCharts({ months }: { months: Month[] }) {
  if (months.length === 0) return null;
  const label = (m: string) => `T${Number(m.slice(5))}`;
  return <div className="summary-grid">
    <Card title="Doanh thu theo tháng" wide>
      <Stacked data={months.map((r) => ({ x: label(r.m), room: r.room, minibar: r.minibar, outside: r.outside, laundry: r.laundry, other: r.other }))} series={LINES} label="Doanh thu theo tháng" />
    </Card>
    {months.some((r) => r.occ !== null) && <Card title="Công suất (OCC) theo tháng" wide>
      <Stacked fmt={pct} axis={(v) => `${v}%`} valueLabel={pct} data={months.map((r) => ({ x: label(r.m), occ: r.occ === null ? null : r.occ * 100 }))} series={[{ key: "occ", name: "Công suất", color: ROOM }]} label="Công suất theo tháng" />
    </Card>}
  </div>;
}

/** Kho: closing value by item kind and the items that went out most. */
export function StockCharts({ lines }: { lines: { name: string; kind: string; closingValue: number; issueValue: number }[] }) {
  const byKind = new Map<string, number>();
  for (const l of lines) if (l.closingValue > 0) byKind.set(l.kind || "Khác", (byKind.get(l.kind || "Khác") ?? 0) + l.closingValue);
  const top = [...lines].filter((l) => l.issueValue > 0).sort((a, b) => b.issueValue - a.issueValue).slice(0, 8);
  if (byKind.size === 0 && top.length === 0) return null;
  const kindColors = entityColors([...byKind.keys()], STOCK_ORDER);
  return <div className="summary-grid">
    {byKind.size > 0 && <Card title="Giá trị tồn cuối theo loại" note="Tỷ trọng giá trị hàng còn trong kho cuối tháng.">
      <Donut width="100%" animate={false} unit="đ" slices={[...byKind].map(([name, value]) => ({ name, value, color: kindColors.get(name)! }))} />
    </Card>}
    {top.length > 0 && <Card title="Mặt hàng xuất nhiều nhất" note="Theo giá trị xuất (giá vốn), 8 mặt hàng đầu.">
      <Stacked horizontal data={top.map((l) => ({ x: l.name, value: l.issueValue }))} series={[{ key: "value", name: "Giá trị xuất", color: SERVICE }]} label="Mặt hàng xuất nhiều nhất" />
    </Card>}
  </div>;
}
