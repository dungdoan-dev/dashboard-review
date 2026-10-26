// The Nhân sự tab: rows of the HR Apps Script web app (getAppData in D:\code.gs), as display strings in the sheet's column order.
export type HrRows = string[][];
export type HrPayload = {
  opt?: Partial<Record<"dept" | "status" | "source" | "result" | "mode" | "staffStatus" | "gender" | "round", string[]>>;
  kpi: { label: string; value: string }[];
  needs: HrRows; cands: HrRows; intvs: HrRows; staff: HrRows; bdays: HrRows;
};
export type HrStaff = { id: string; name: string; dob: string; note: string; gender: string; phone: string; email: string; dept: string; title: string; start: string; status: string; tenure: string; nextBday: string; daysLeft: number | null };
export type HrBirthday = { id: string; name: string; dept: string; dob: string; next: string; daysLeft: number | null; age: string };

const cell = (row: string[], i: number) => String(row[i] ?? "").trim();
const days = (s: string) => (s === "" || Number.isNaN(Number(s)) ? null : Number(s));

/** Staff columns: A mã, B tên, D giới tính, E SĐT, F email, G bộ phận, H chức danh, I ngày vào, K trạng thái, L thâm niên (tháng), P sinh nhật tới, Q còn (ngày). */
export const staffOf = (rows: HrRows): HrStaff[] => rows.filter((r) => cell(r, 0)).map((r) => ({
  id: cell(r, 0), name: cell(r, 1), dob: cell(r, 2), note: cell(r, 14), gender: cell(r, 3), phone: cell(r, 4), email: cell(r, 5), dept: cell(r, 6), title: cell(r, 7),
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

export type HrNeed = { id: string; date: string; dept: string; title: string; qty: number; due: string; by: string; salary: string; status: string; note: string };
export type HrCand = { id: string; need: string; dob: string; gender: string; note: string; date: string; dept: string; title: string; name: string; phone: string; email: string; source: string; status: string; cv: string; owner: string };
export type HrIntv = { id: string; place: string; comment: string; candId: string; name: string; title: string; round: string; date: string; time: string; mode: string; interviewer: string; result: string };

const count = (s: string) => { const n = Number(s.replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };

/** Nhu cầu tuyển dụng columns: A mã, B ngày, C bộ phận, D vị trí, E số lượng, F hạn, G người yêu cầu, H lương, K trạng thái, L ghi chú. */
export const needsOf = (rows: HrRows): HrNeed[] => rows.filter((r) => cell(r, 0)).map((r) => ({
  id: cell(r, 0), date: cell(r, 1), dept: cell(r, 2), title: cell(r, 3), qty: count(cell(r, 4)) || 1, due: cell(r, 5), by: cell(r, 6), salary: cell(r, 7), status: cell(r, 10), note: cell(r, 11),
}));

/** Ứng viên columns: A mã, B ngày, D bộ phận, E vị trí, F tên, I SĐT, J email, K nguồn, L trạng thái, M link CV, N người phụ trách. */
export const candsOf = (rows: HrRows): HrCand[] => rows.filter((r) => cell(r, 0)).map((r) => ({
  id: cell(r, 0), need: cell(r, 2), dob: cell(r, 6), gender: cell(r, 7), note: cell(r, 14), date: cell(r, 1), dept: cell(r, 3), title: cell(r, 4), name: cell(r, 5), phone: cell(r, 8), email: cell(r, 9), source: cell(r, 10), status: cell(r, 11), cv: cell(r, 12), owner: cell(r, 13),
}));

/** Lịch phỏng vấn columns: A mã PV, B mã UV, C tên, D vị trí, E vòng, F ngày, G giờ, H hình thức, J người PV, K kết quả. */
export const intvsOf = (rows: HrRows): HrIntv[] => rows.filter((r) => cell(r, 0)).map((r) => ({
  id: cell(r, 0), place: cell(r, 8), comment: cell(r, 11), candId: cell(r, 1), name: cell(r, 2), title: cell(r, 3), round: cell(r, 4), date: cell(r, 5), time: cell(r, 6), mode: cell(r, 7), interviewer: cell(r, 9), result: cell(r, 10),
}));

export type Tone = "green" | "azure" | "orange" | "red" | "purple" | "gray";
/** Colour of a status badge (ứng viên, phỏng vấn, nhân sự), by the words in the status. */
export const statusTone = (status: string): Tone => {
  const s = status.toLowerCase();
  if (/không|loại|trượt|hủy|nghỉ/.test(s)) return "red";
  if (/chính thức|đạt|hoàn tất|đã nhận/.test(s)) return "green";
  if (/offer/.test(s)) return "purple";
  if (/phỏng vấn|hẹn|đang|thử việc/.test(s)) return "azure";
  if (/mới|sàng lọc|chờ/.test(s)) return "orange";
  return "gray";
};
