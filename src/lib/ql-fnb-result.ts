// "KQHĐ KD" of an Ăn sáng, cafe unit and of a Mini mart unit, in the finance team's two templates (DANH MUC CHI KS, ASCF, MN.xlsx, tab KQHĐ KD): revenue and discount, cost of goods from the kho,
// then the costs in their lines (2 vận hành, 3 DV ngoài, 4 nhân sự, 5 thuế). What was bought for the kho (nguyên liệu, hàng hóa, bao bì, vật tư) is not a cost here: the cost of goods issued replaces it.
// Pure function: tested by ql-fnb-result.test.ts. Imports use ".ts" because tests run this with plain Node.
import type { ExpenseLine } from "./finance-summary.ts";
import type { StockReport } from "./inventory.ts";
import type { KiotvietExport } from "./kiotviet.ts";

const norm = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/đ/g, "d").replace(/[–—-]/g, " ").replace(/\s+/g, " ").trim();

export type FnbTemplate = "cafe" | "mart";
export type FnbResultRow = { stt?: string; label: string; code?: string; kind: "total" | "line" | "section"; values: number[]; note?: string };

// Lines of the templates: [code, label]. The cafe's "Chi quản lý, Vận hành" is under 3 (DV ngoài), the mini mart's under 2 (vận hành).
const OPERATING: [string, string][] = [["2.1", "Chi đầu tư TSCĐ"], ["2.2", "Chi mua đồ dùng CCDC"], ["2.3", "Chi sửa chữa – Bảo dưỡng"], ["2.4", "Chi Sự kiện"], ["2.5", "Chi khác"], ["2.6", "Chi bồi thường KH"]];
const SERVICES: [string, string][] = [["3.1", "Chi điện nước – Viễn thông, phí dv"], ["3.2", "Chi dịch vụ ngoài - phần mềm ql"], ["3.3", "Chi Marketing"]];
const PAYROLL: [string, string][] = [["4.1", "Chi lương nv"], ["4.2", "Chi thưởng doanh thu, KPI"], ["4.3", "Lương tăng ca"], ["4.4", "Chi phụ cấp"], ["4.5", "Thưởng lương tháng 13"], ["4.6", "Chi phúc lợi"], ["4.7", "Chi BHXH"]];
const TAX: [string, string][] = [["5.1", "Nộp thuế GTGT"], ["5.2", "Nộp thuế TNDN"]];

/** The payroll line of an expense of the nhân sự kind, told by what it says (one kind in the list, seven lines in the template). */
export const payrollCode = (note: string) => {
  const n = norm(note);
  return /tang ca|ngoai gio/.test(n) ? "4.3" : /thang 13|luong 13/.test(n) ? "4.5" : /kpi|thuong/.test(n) ? "4.2" : /phu cap/.test(n) ? "4.4" : /bhxh|bhyt|bhtn|bao hiem/.test(n) ? "4.7"
    : /phuc loi|qua |sinh nhat|cuoi|hieu|thai san|tham hoi|du lich|tet|chuc mung/.test(n) ? "4.6" : "4.1";
};

type Bucket = { code: string } | { skip: true } | { bought: true } | { unknown: true };
/** Where an expense kind goes, by its name (the lists of the units name some kinds a little differently). */
function bucketOf(kind: string, note: string, template: FnbTemplate): Bucket {
  const n = norm(kind);
  if (/dieu chuyen|rut tien|luan chuyen/.test(n)) return { skip: true }; // money between funds
  if (/dau tu tscd/.test(n)) return { code: "2.1" };
  if (/do dung|ccdc/.test(n)) return { code: "2.2" };
  if (/sua chua|bao duong/.test(n)) return { code: "2.3" };
  if (/su kien|khai truong/.test(n)) return { code: "2.4" };
  if (/boi thuong/.test(n)) return { code: "2.6" };
  if (/quan ly/.test(n)) return { code: template === "cafe" ? "3.4" : "2.7" };
  if (/dien nuoc|vien thong/.test(n)) return { code: "3.1" };
  if (/dich vu ngoai|phan mem/.test(n)) return { code: "3.2" };
  if (/marketing|maketing/.test(n)) return { code: "3.3" };
  if (/nhan su|luong|bhxh|phuc loi/.test(n)) return { code: payrollCode(note) };
  if (/thue|phap ly/.test(n)) return { code: /tndn|thu nhap doanh nghiep/.test(norm(note)) ? "5.2" : "5.1" };
  if (/nguyen lieu|gia vi|hang hoa|bao bi|vat tu/.test(n)) return { bought: true };
  if (/^chi khac$|hoan tien/.test(n)) return { code: "2.5" };
  return { unknown: true };
}

/**
 * month: the lines dated in it count. kiotviet: the unit's weekly export (list price and discount), without it the revenue is what the ledger shows (counter sales + what was charged to hotel rooms) and the discount is 0.
 * stocks: the unit's kho reports; without any, the cost of goods is what was bought.
 */
export function fnbResult(template: FnbTemplate, input: { month: string; expenses: ExpenseLine[]; ledgerSales: number; kiotviet?: KiotvietExport | null; stocks?: { name: string; report: StockReport }[] }) {
  const { month, kiotviet } = input;
  const notes: string[] = [];
  const lines = new Map<string, number>(), add = (code: string, v: number) => lines.set(code, (lines.get(code) ?? 0) + v);
  let bought = 0; const unknown = new Set<string>();
  for (const e of input.expenses) {
    if (e.date.slice(0, 7) !== month) continue;
    const paid = e.cash + e.bank + e.visa, b = bucketOf(e.kind, e.note, template);
    if ("code" in b) add(b.code, paid); else if ("bought" in b) bought += paid; else if ("unknown" in b) { add("2.5", paid); unknown.add(e.kind || "(trống)"); }
  }
  if (unknown.size) notes.push(`Hạng mục chưa có trong mẫu, tính vào Chi khác: ${[...unknown].join(", ")}.`);

  const kho = (re: RegExp) => (input.stocks ?? []).filter((s) => re.test(norm(s.name))).reduce((t, s) => t + s.report.totals.issueValue, 0);
  const hasKho = (input.stocks ?? []).some((s) => /nguyen lieu|vat tu|hang hoa/.test(norm(s.name)));
  const cost: [string, string, number][] = template === "cafe"
    ? [["1.1", "Giá vốn nguyên liệu cafe xuất kho", kho(/nguyen lieu cafe/)], ["1.2", "Giá vốn nguyên liệu AS xuất kho", kho(/nguyen lieu an sang/)], ["1.3", "Giá vốn vật tư xuất kho", kho(/vat tu/)]]
    : [["1.1", "Giá vốn hàng hóa xuất kho", kho(/hang hoa/)]];
  if (!hasKho) { cost[0][2] = bought; notes.push("Chưa có sheet kho: giá vốn tính theo tiền đã mua (nguyên liệu, hàng hóa, bao bì, vật tư)."); }

  const gross = kiotviet ? kiotviet.days.reduce((t, d) => t + d.listed, 0) : input.ledgerSales, revenue = kiotviet ? kiotviet.days.reduce((t, d) => t + d.revenue, 0) : input.ledgerSales;
  const discount = revenue - gross; // negative
  if (!kiotviet) notes.push("Chưa có tab KIOTVIET: doanh thu theo tiền thu trong sổ, chưa có giảm giá.");

  const rows: FnbResultRow[] = [];
  const total = (label: string, v: number, extra: Partial<FnbResultRow> = {}) => rows.push({ kind: "total", label, values: [v], ...extra });
  const line = (code: string, label: string, v: number, note?: string) => rows.push({ kind: "line", label, code, values: [v], note });
  const group = (label: string, items: [string, string][]) => { total(label, items.reduce((t, [c]) => t + (lines.get(c) ?? 0), 0)); for (const [c, l] of items) line(c, l, lines.get(c) ?? 0); return items.reduce((t, [c]) => t + (lines.get(c) ?? 0), 0); };

  total("I. TỔNG DOANH THU", gross + discount, { stt: "1" });
  total("1. Doanh thu bán hàng", gross, { code: "1" }); line("1.1", "- Doanh thu bán hàng", gross, kiotviet ? "Giá niêm yết của báo cáo KiotViet" : undefined);
  total("2. Giảm trừ doanh thu", discount, { code: "2" }); line("2.1", "- Giảm giá khách hàng", discount, kiotviet ? "Giá niêm yết trừ giá bán, theo KiotViet" : undefined);

  const costTotal = cost.reduce((t, c) => t + c[2], 0);
  const operating = template === "mart" ? [...OPERATING, ["2.7", "Chi quản lý, vận hành"] as [string, string]] : OPERATING;
  const services = template === "cafe" ? [...SERVICES, ["3.4", "Chi quản lý, Vận hành"] as [string, string]] : SERVICES;
  const costStart = rows.length;
  total("II. TỔNG CHI PHÍ", 0, { stt: "2" });
  total("1. Giá vốn", costTotal); for (const [c, l, v] of cost) line(c, l, v, c === "1.1" && !hasKho ? "Theo tiền mua" : undefined);
  const parts = [costTotal, group("2. Chi vận hành", operating), group("3. Chi DV ngoài", services), group("4. Chi phí nhân sự", PAYROLL), group("5. Chi nộp thuế", TAX)];
  const expenses = parts.reduce((t, v) => t + v, 0);
  rows[costStart].values = [expenses];
  total("III. LỢI NHUẬN TỪ HĐKD (III= I-II)", gross + discount - expenses);
  return { columns: [`Tháng ${month.slice(5)}/${month.slice(0, 4)}`], rows, notes };
}
