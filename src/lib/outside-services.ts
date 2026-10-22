// "DV Ngoài" tab of a hotel's sheet: services the hotel resells for a partner (motorbike rental, laundry...), one line per order.
// Pure functions: tested by outside-services.test.ts. Imports use ".ts" because tests run this with plain Node.
import { ledgerDate } from "./bluejay-reconcile.ts";

const norm = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/đ/g, "d").replace(/\s+/g, " ").trim();
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export type OutsideLine = { row: number; date: string; room: string; service: string; note: string; cost: number; price: number; profit: number; discount: number }; // cost: what the partner charges the hotel, price: what the guest pays
export type OutsideService = { name: string; count: number; cost: number; price: number; profit: number; discount: number };

/** rows: the sheet as an array of rows. The block of totals to the right of the lines is not read: the totals are added up here from the lines. */
export function parseOutsideServices(rows: unknown[][]) {
  const head = rows.findIndex((r) => r.some((c) => norm(c) === "dich vu") && r.some((c) => norm(c) === "gia ban dv"));
  if (head < 0) throw new Error("Không nhận ra bảng dịch vụ ngoài: không thấy cột “Dịch vụ” và “Giá bán DV”.");
  const at = (re: RegExp) => rows[head].findIndex((c) => re.test(norm(c)));
  const col = { date: at(/^date/), room: at(/^id phong$/), service: at(/^dich vu$/), note: at(/^dien giai$/), cost: at(/^gia dv thue$/), price: at(/^gia ban dv$/), discount: at(/^chiet khau/) };
  if (col.date < 0 || col.cost < 0) throw new Error("Bảng dịch vụ ngoài thiếu cột “Date” hoặc “Giá DV thuê”.");
  const lines: OutsideLine[] = [];
  for (let i = head + 1; i < rows.length; i++) {
    const r = rows[i], date = ledgerDate(r[col.date]), service = String(r[col.service] ?? "").trim();
    if (!date || !service) continue; // totals row and blank rows
    const cost = num(r[col.cost]), price = num(r[col.price]);
    lines.push({ row: i + 1, date, room: String(r[col.room] ?? "").trim(), service, note: String(r[col.note] ?? "").trim(), cost, price, profit: price - cost, discount: col.discount >= 0 ? num(r[col.discount]) : 0 });
  }
  const byName = new Map<string, OutsideService>();
  for (const l of lines) {
    const s = byName.get(l.service) ?? { name: l.service, count: 0, cost: 0, price: 0, profit: 0, discount: 0 };
    s.count++; s.cost += l.cost; s.price += l.price; s.profit += l.profit; s.discount += l.discount;
    byName.set(l.service, s);
  }
  return { lines, byService: [...byName.values()].sort((a, b) => b.price - a.price) };
}
