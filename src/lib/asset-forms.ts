// The asset Google Sheet ("Quản lý tài sản") as the Tài sản page sees it. The field lists are the whitelist of /api/assets:
// only these input columns are sent to the Apps Script (scripts/apps-script/quan-ly-tai-san.gs), which checks them again.
import type { FieldType } from "./hr-forms.ts";

export type AssetTab = "ts" | "bg" | "mt" | "bt" | "kk" | "tl" | "loai" | "nv";
/** Lists of the Danh mục tab, the other tabs' keys, or a yes/no choice. */
export type AssetList = "unit" | "dept" | "loc" | "ncc" | "condition" | "handover" | "maintenance" | "count" | "disposal" | "staffStatus" | "group" | "assets" | "types" | "staff" | "yesNo";
/** key = the sheet column letter the value goes to. */
export type AssetField = { key: string; label: string; type: FieldType; options?: AssetList; required?: boolean; wide?: boolean };
export type AssetSheet = { headers: string[]; inputs: number[]; rows: { row: number; cells: string[] }[] };
export type AssetPayload = { tabs: Record<AssetTab, AssetSheet>; lists: string[][] };

const t = (key: string, label: string, extra: Partial<AssetField> = {}): AssetField => ({ key, label, type: "text", ...extra });
const d = (key: string, label: string, required?: boolean): AssetField => ({ key, label, type: "date", required });
const n = (key: string, label: string, required?: boolean): AssetField => ({ key, label, type: "number", required });
const s = (key: string, label: string, options: AssetList, required?: boolean): AssetField => ({ key, label, type: "select", options, required });
const note = (key: string, label = "Ghi chú"): AssetField => ({ key, label, type: "textarea", wide: true });

/** Tabs in menu order: title, what one row is called, its fields, the columns of its table (letters; empty = all) and the column to filter by. */
export const ASSET_TABS: Record<AssetTab, { title: string; item: string; fields: AssetField[]; cols?: string[]; filter?: string; nextId?: boolean }> = {
  ts: { title: "Tài sản", item: "tài sản", cols: ["A", "B", "D", "AC", "AE", "AF", "K", "Z", "AL"], filter: "AF", fields: [
    t("A", "Mã tài sản", { required: true }), t("B", "Tên tài sản", { required: true }), s("C", "Mã loại", "types", true), t("E", "Hãng / Model"), t("F", "Serial"),
    s("G", "Nhà cung cấp", "ncc"), t("H", "Số hóa đơn"), d("I", "Ngày mua"), d("J", "Ngày bắt đầu sử dụng", true), n("K", "Nguyên giá (VNĐ)", true),
    n("L", "Số tháng khấu hao (trống = theo loại)"), n("N", "Giá trị thanh lý dự kiến (VNĐ)"), s("O", "Đơn vị quản lý", "unit"), s("P", "Vị trí ban đầu", "loc"),
    s("Q", "Tình trạng", "condition"), d("R", "Hạn bảo hành"), t("S", "Ảnh / tài liệu (link)", { wide: true }), note("T"),
  ] },
  bg: { title: "Bàn giao", item: "phiếu bàn giao", filter: "C", nextId: true, fields: [
    t("A", "Số phiếu", { required: true }), d("B", "Ngày", true), s("C", "Loại phiếu", "handover", true), s("D", "Tài sản", "assets", true),
    s("F", "Người giao", "staff"), s("G", "Người nhận", "staff"), s("J", "Vị trí đến", "loc"), s("K", "Tình trạng lúc giao", "condition"),
    t("L", "Ảnh tình trạng (link)"), t("M", "Link biên bản"), s("N", "Đã ký biên bản", "yesNo"), note("P"),
  ] },
  mt: { title: "Mượn trả", item: "phiếu mượn", filter: "J", nextId: true, fields: [
    t("A", "Số phiếu", { required: true }), s("B", "Tài sản", "assets", true), s("D", "Người mượn", "staff", true), d("F", "Ngày mượn", true), d("G", "Hạn trả"),
    d("H", "Ngày trả thực tế"), s("I", "Tình trạng khi trả", "condition"), note("L"),
  ] },
  bt: { title: "Bảo trì", item: "phiếu bảo trì", filter: "M", nextId: true, fields: [
    t("A", "Số phiếu", { required: true }), s("B", "Tài sản", "assets", true), s("D", "Loại", "maintenance"), d("E", "Ngày dự kiến"), d("F", "Ngày bắt đầu"),
    d("G", "Ngày hoàn thành"), t("H", "Đơn vị thực hiện"), n("J", "Chi phí (VNĐ)"), t("K", "Kết quả"), t("L", "Link biên bản"), note("I", "Nội dung"),
  ] },
  kk: { title: "Kiểm kê", item: "dòng kiểm kê", filter: "F", fields: [
    t("A", "Mã đợt", { required: true }), d("B", "Ngày kiểm", true), s("C", "Tài sản", "assets", true), s("F", "Kết quả", "count", true),
    s("G", "Vị trí thực tế", "loc"), s("H", "Người kiểm", "staff"), s("I", "Đã áp dụng vào sổ", "yesNo"),
  ] },
  tl: { title: "Thanh lý", item: "phiếu thanh lý", filter: "F", nextId: true, fields: [
    t("A", "Số phiếu", { required: true }), s("B", "Tài sản", "assets", true), d("D", "Ngày thanh lý", true), s("F", "Hình thức", "disposal"), n("I", "Giá thu hồi (VNĐ)"),
    s("K", "Người đề xuất", "staff"), s("L", "Người duyệt", "staff"), note("E", "Lý do"),
  ] },
  loai: { title: "Loại tài sản", item: "loại tài sản", fields: [
    t("A", "Mã loại", { required: true }), t("B", "Tên loại", { required: true }), s("C", "Nhóm", "group"), t("D", "Tiền tố mã"),
    n("E", "Số tháng khấu hao mặc định"), n("F", "Chu kỳ bảo trì (tháng, 0 = không)"),
  ] },
  nv: { title: "Nhân viên", item: "nhân viên", filter: "H", fields: [
    t("A", "Mã NV", { required: true }), t("B", "Họ tên", { required: true }), { key: "C", label: "Email", type: "email" }, { key: "D", label: "Điện thoại", type: "tel" },
    s("E", "Phòng ban", "dept"), s("F", "Đơn vị", "unit"), t("G", "Chức danh"), s("H", "Trạng thái", "staffStatus"),
  ] },
};
export const ASSET_TAB_KEYS = Object.keys(ASSET_TABS) as AssetTab[];
export const isAssetTab = (value: unknown): value is AssetTab => typeof value === "string" && Object.hasOwn(ASSET_TABS, value);

/** "A" → 0, "AL" → 37. */
export const colIndex = (letter: string) => [...letter].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

/** Columns (0-based) of the Danh mục tab, read from row 4: [value column, label column]. */
const LIST_COLS: Partial<Record<AssetList, [number, number]>> = {
  unit: [0, 1], dept: [3, 4], loc: [7, 8], ncc: [11, 12], condition: [16, 16], handover: [17, 17], maintenance: [18, 18], count: [19, 19], disposal: [20, 20], staffStatus: [21, 21], group: [22, 22],
};

/** The choices of a select field: [value, label]. */
export function assetOptions(data: AssetPayload, list: AssetList): [string, string][] {
  const keyed = (tab: AssetTab, label: number) => data.tabs[tab].rows.map((r): [string, string] => [r.cells[0], `${r.cells[0]} — ${r.cells[label] ?? ""}`]);
  if (list === "assets") return keyed("ts", 1);
  if (list === "types") return keyed("loai", 1);
  if (list === "staff") return keyed("nv", 1);
  if (list === "yesNo") return [["Có", "Có"], ["Không", "Không"]];
  const [v, l] = LIST_COLS[list]!;
  return data.lists.filter((r) => String(r[v] ?? "").trim()).map((r) => [r[v].trim(), v === l ? r[v].trim() : `${r[v].trim()} — ${r[l]}`]);
}

/** Values of an existing row for its edit form: dates as yyyy-mm-dd, amounts without the thousand dots. */
export function assetFormValues(tab: AssetTab, cells: string[]) {
  return Object.fromEntries(ASSET_TABS[tab].fields.map((f) => {
    const v = String(cells[colIndex(f.key)] ?? "").trim();
    if (f.type === "date") { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v); return [f.key, m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : ""]; }
    if (f.type === "number") return [f.key, /^[\d.,]+$/.test(v) ? v.replace(/[.,]/g, "") : ""];
    return [f.key, v];
  }));
}

/** The next "XX-2026-0001" style number of a tab: highest number of this year + 1, the prefix taken from the existing rows. */
export function nextAssetId(keys: string[], year = new Date().getFullYear()) {
  const parsed = keys.map((k) => /^([A-Z]+)-(\d{4})-(\d+)$/.exec(k)).filter((m) => m !== null);
  if (!parsed.length) return "";
  const prefix = parsed[0][1], width = parsed[0][3].length;
  const max = parsed.filter((m) => m[1] === prefix && Number(m[2]) === year).reduce((a, m) => Math.max(a, Number(m[3])), 0);
  return `${prefix}-${year}-${String(max + 1).padStart(width, "0")}`;
}

/** The input values of a save request the sheet may receive: only the tab's own columns, trimmed and checked by type. Throws a message for the user. */
export function cleanAssetFields(tab: AssetTab, input: unknown): Record<string, string> {
  if (!input || typeof input !== "object") throw new Error("Dữ liệu không hợp lệ.");
  const source = input as Record<string, unknown>, out: Record<string, string> = {};
  for (const f of ASSET_TABS[tab].fields) {
    const raw = source[f.key];
    const v = raw === undefined || raw === null ? "" : String(raw).trim();
    if (f.required && !v) throw new Error(`Thiếu ${f.label.toLowerCase()}.`);
    if (raw === undefined || raw === null) continue;
    if (v.length > (f.type === "textarea" ? 2000 : 300)) throw new Error(`${f.label} quá dài.`);
    if (v && f.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${f.label} không phải ngày hợp lệ.`);
    if (v && f.type === "number" && !/^\d{1,15}$/.test(v)) throw new Error(`${f.label} phải là số nguyên không âm.`);
    if (v && f.type === "email" && !/^[^\s@]+@[^\s@]+$/.test(v)) throw new Error(`${f.label} không hợp lệ.`);
    out[f.key] = v;
  }
  return out;
}

/** Where a tab's rows point at their unit: the asset sheet by its own unit column, the slips through the asset code, the staff by their unit. Loại tài sản has none. */
const UNIT_OF: Partial<Record<AssetTab, { unit: string } | { asset: string }>> = {
  ts: { unit: "O" }, nv: { unit: "F" }, bg: { asset: "D" }, mt: { asset: "B" }, bt: { asset: "B" }, kk: { asset: "C" }, tl: { asset: "B" },
};

/** The units of the Danh mục tab: [code, name]. */
export const assetUnits = (data: AssetPayload): [string, string][] => data.lists.filter((r) => String(r[0] ?? "").trim()).map((r) => [r[0].trim(), String(r[1] ?? "").trim()]);

/** The payload cut down to one unit (by its code); each slip follows the unit managing its asset. */
export function filterByUnit(data: AssetPayload, unit: string): AssetPayload {
  const ofAsset = new Map(data.tabs.ts.rows.map((r) => [r.cells[0], String(r.cells[colIndex("O")] ?? "").trim()]));
  const tabs = Object.fromEntries(Object.entries(data.tabs).map(([key, sheet]) => {
    const how = UNIT_OF[key as AssetTab];
    if (!how) return [key, sheet];
    const at = colIndex("unit" in how ? how.unit : how.asset);
    const keep = (cells: string[]) => ("unit" in how ? String(cells[at] ?? "").trim() : ofAsset.get(String(cells[at] ?? "").trim())) === unit;
    return [key, { ...sheet, rows: sheet.rows.filter((r) => keep(r.cells)) }];
  })) as AssetPayload["tabs"];
  return { ...data, tabs };
}
