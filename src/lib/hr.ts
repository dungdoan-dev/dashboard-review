// The Nhân sự tab: rows of the HR Apps Script web app (getAppData in D:\code.gs), as display strings in the sheet's column order.
export type HrRows = string[][];
export type HrPayload = {
  kpi: { label: string; value: string }[];
  needs: HrRows; cands: HrRows; intvs: HrRows; staff: HrRows; bdays: HrRows;
};
export type HrStaff = { id: string; name: string; gender: string; phone: string; email: string; dept: string; title: string; start: string; status: string; tenure: string; nextBday: string; daysLeft: number | null };
export type HrBirthday = { id: string; name: string; dept: string; dob: string; next: string; daysLeft: number | null; age: string };

const cell = (row: string[], i: number) => String(row[i] ?? "").trim();
const days = (s: string) => (s === "" || Number.isNaN(Number(s)) ? null : Number(s));

/** Staff columns: A mã, B tên, D giới tính, E SĐT, F email, G bộ phận, H chức danh, I ngày vào, K trạng thái, L thâm niên (tháng), P sinh nhật tới, Q còn (ngày). */
export const staffOf = (rows: HrRows): HrStaff[] => rows.filter((r) => cell(r, 0)).map((r) => ({
  id: cell(r, 0), name: cell(r, 1), gender: cell(r, 3), phone: cell(r, 4), email: cell(r, 5), dept: cell(r, 6), title: cell(r, 7),
  start: cell(r, 8), status: cell(r, 10), tenure: cell(r, 11), nextBday: cell(r, 15), daysLeft: days(cell(r, 16)),
}));

/** Sinh nhật tab columns: mã, họ tên, bộ phận, ngày sinh, sinh nhật tới, còn (ngày), tuổi sắp tới. */
export const birthdaysOf = (rows: HrRows): HrBirthday[] => rows.filter((r) => cell(r, 0) && cell(r, 1)).map((r) => ({
  id: cell(r, 0), name: cell(r, 1), dept: cell(r, 2), dob: cell(r, 3), next: cell(r, 4), daysLeft: days(cell(r, 5)), age: cell(r, 6),
}));

export const countBy = <T,>(items: T[], key: (item: T) => string) => {
  const out = new Map<string, number>();
  for (const item of items) { const k = key(item) || "Chưa cập nhật"; out.set(k, (out.get(k) ?? 0) + 1); }
  return [...out].sort((a, b) => b[1] - a[1]);
};
