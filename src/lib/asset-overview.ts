// The numbers of the Tài sản overview, from the sheet's own computed columns (as displayed: "24.000.000", "-" for nothing).
import { colIndex, type AssetPayload } from "./asset-forms.ts";

/** "24.000.000" → 24000000; "-", "" or text → 0. */
export const money = (text: string | undefined) => { const v = String(text ?? "").trim(); return /^-?[\d.]+$/.test(v) ? Number(v.replace(/\./g, "")) : 0; };

const TS = { type: colIndex("D"), cost: colIndex("K"), unit: colIndex("O"), disposed: colIndex("U"), used: colIndex("Y"), left: colIndex("Z"), holder: colIndex("AC"), place: colIndex("AE"), status: colIndex("AF"), alert: colIndex("AL") };
const MT = { asset: colIndex("B"), name: colIndex("C"), who: colIndex("E"), due: colIndex("G"), state: colIndex("J"), late: colIndex("K") };
const BT = { planned: colIndex("E"), start: colIndex("F"), done: colIndex("G"), cost: colIndex("J") };
const UNSET = "Chưa cập nhật";

export type ValueRow = { x: string; left: number; used: number };
export type Issue = { id: string; name: string; who: string; place: string; text: string };

/** "dd/mm/yyyy" → "yyyy-mm", or "". */
const monthOf = (text: string | undefined) => { const m = /^\d{1,2}\/(\d{1,2})\/(\d{4})$/.exec(String(text ?? "").trim()); return m ? `${m[2]}-${m[1].padStart(2, "0")}` : ""; };

/** The 12 months up to `today` as "yyyy-mm". */
export function lastMonths(today: Date, n = 12) {
  return Array.from({ length: n }, (_, i) => { const d = new Date(today.getFullYear(), today.getMonth() - (n - 1 - i), 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
}

export function assetOverview(data: AssetPayload, today = new Date()) {
  const all = data.tabs.ts.rows.map((r) => r.cells);
  const active = all.filter((c) => !String(c[TS.disposed] ?? "").trim() && !/thanh lý/i.test(c[TS.status] ?? ""));
  const sum = (rows: string[][], at: number) => rows.reduce((t, c) => t + money(c[at]), 0);
  const cost = sum(active, TS.cost), left = sum(active, TS.left), used = sum(active, TS.used);

  /** Remaining and written-off value per group, biggest original cost first. */
  const valueBy = (at: number): ValueRow[] => [...active.reduce((m, c) => {
    const k = String(c[at] ?? "").trim() || UNSET, v = m.get(k) ?? { x: k, left: 0, used: 0 };
    v.left += money(c[TS.left]); v.used += money(c[TS.used]);
    return m.set(k, v);
  }, new Map<string, ValueRow>()).values()].sort((a, b) => b.left + b.used - (a.left + a.used));

  const byStatus = [...all.reduce((m, c) => { const k = String(c[TS.status] ?? "").trim() || UNSET; return m.set(k, (m.get(k) ?? 0) + 1); }, new Map<string, number>())]
    .map(([x, n]) => ({ x, n })).sort((a, b) => b.n - a.n);

  const months = lastMonths(today);
  const spend = new Map(months.map((m) => [m, 0]));
  for (const r of data.tabs.bt.rows) {
    const c = r.cells, m = monthOf(c[BT.done]) || monthOf(c[BT.start]) || monthOf(c[BT.planned]);
    if (spend.has(m)) spend.set(m, spend.get(m)! + money(c[BT.cost]));
  }
  const maintenance = months.map((m) => ({ x: `${m.slice(5)}/${m.slice(2, 4)}`, cost: spend.get(m)! }));

  const late = data.tabs.mt.rows.map((r) => r.cells).filter((c) => /quá hạn/i.test(c[MT.state] ?? ""));
  const issues: Issue[] = [
    ...active.filter((c) => String(c[TS.alert] ?? "").trim()).map((c) => ({ id: c[0], name: c[1], who: c[TS.holder] ?? "", place: c[TS.place] ?? "", text: c[TS.alert].trim() })),
    ...late.map((c) => ({ id: c[MT.asset], name: c[MT.name] ?? "", who: c[MT.who] ?? "", place: "", text: `Mượn quá hạn${c[MT.late] ? ` ${c[MT.late]} ngày` : ""} (hạn ${c[MT.due] || "—"}).` })),
  ];

  return {
    count: active.length, disposed: all.length - active.length, cost, left, used, usedShare: cost ? used / cost : 0,
    lateLoans: late.length, issues, byStatus, byType: valueBy(TS.type), byUnit: valueBy(TS.unit), maintenance,
    maintenanceTotal: maintenance.reduce((t, m) => t + m.cost, 0),
  };
}
