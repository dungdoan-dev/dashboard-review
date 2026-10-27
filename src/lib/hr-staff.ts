// Staff of the HR Google Sheets (one file per unit, tab "Danh sách nhân viên"), kept in public.hr_staff by the daily sync.
// No "@/" imports: used by files tested with plain Node. Everything of the sheet's Hồ sơ NV tab is kept except the ID card, social insurance and tax numbers, salary, insurance base and bank account.

export type HrStaffRow = {
  unit: string; staff_id: string; name: string; department: string; position: string; level: string; job_type: string; gender: string;
  birth_date: string | null; start_date: string | null; end_date: string | null; status: string; marital: string; education: string;
  hiring_source: string; contract_type: string; contract_end: string | null; probation_status: string; probation_end: string | null; leave_reason: string;
  children: string; ethnicity: string; religion: string; nationality: string; school: string; major: string; certificate: string; grad_year: string; grade: string;
  work_email: string; personal_email: string; phone: string; address: string; district: string; province: string; contract_link: string; probation_start: string | null;
};

// Header names of the sheet by field; the first one a file has is used (the files differ: "Địa chỉ" / "Địa chỉ tạm trú" / "Số đường").
const TEXT: Record<string, string[]> = {
  name: ["Họ và tên"], department: ["Phòng ban"], position: ["Vị trí công việc"], level: ["Cấp bậc"], job_type: ["Loại công việc"], gender: ["Giới tính"], status: ["Trạng thái"], marital: ["Tình trạng hôn nhân"], education: ["Học vấn"],
  hiring_source: ["Nguồn tuyển dụng"], contract_type: ["Loại hợp đồng"], probation_status: ["Trạng thái thử việc"], leave_reason: ["Lý do nghỉ việc"],
  children: ["Số người con"], ethnicity: ["Dân tộc"], religion: ["Tôn giáo"], nationality: ["Quốc tịch"], school: ["Nơi đào tạo"], major: ["Chuyên ngành"], certificate: ["Chứng chỉ"], grad_year: ["Năm tốt nghiệp"], grade: ["Xếp loại"],
  work_email: ["Email công việc"], personal_email: ["Email cá nhân"], phone: ["Số điện thoại"], address: ["Địa chỉ", "Địa chỉ thường trú", "Địa chỉ tạm trú", "Số đường"], district: ["Huyện/Quận"], province: ["Tỉnh/TP"], contract_link: ["Link file hợp đồng"],
};
const DATES: Record<string, string[]> = { birth_date: ["Ngày sinh"], start_date: ["Ngày bắt đầu"], end_date: ["Ngày nghỉ việc"], contract_end: ["Ngày hết hạn hợp đồng"], probation_start: ["Ngày thử việc"], probation_end: ["Ngày kết thúc thử việc"] };
const ID = "Mã số NV";

const text = (v: unknown) => String(v ?? "").trim();
const iso = (y: number, m: number, d: number) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? t.toISOString().slice(0, 10) : null; };

/** A date cell: an Excel serial (the sheet is read unformatted) or "dd/mm/yyyy" text; null when empty or not a date. */
export function sheetDate(v: unknown): string | null {
  if (typeof v === "number") return v > 20_000 && v < 80_000 ? new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86_400_000).toISOString().slice(0, 10) : null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text(v));
  return m ? iso(Number(m[3]), Number(m[2]), Number(m[1])) : null;
}

/** Rows of the "Danh sách nhân viên" tab. The columns differ from file to file, so each is found by its header name; rows without a staff id are skipped. */
export function parseStaff(rows: unknown[][], unit: string): HrStaffRow[] {
  const at = rows.findIndex((r) => r.some((c) => text(c) === ID) && r.some((c) => text(c) === TEXT.name[0]));
  if (at < 0) throw new Error(`Không thấy dòng tiêu đề "${ID}" trong tab Danh sách nhân viên.`);
  const col = new Map(rows[at].map((c, i) => [text(c), i] as const).filter(([h]) => h));
  const cell = (r: unknown[], headers: string[]) => { const h = headers.find((x) => col.has(x) && text(r[col.get(x)!]) !== ""); return h ? r[col.get(h)!] : undefined; };
  const byId = new Map<string, HrStaffRow>(); // a repeated id keeps its last row: one upsert may not carry a key twice
  for (const r of rows.slice(at + 1)) {
    const id = text(cell(r, [ID]));
    if (!id) continue;
    byId.set(id, {
      unit, staff_id: id,
      ...Object.fromEntries(Object.entries(TEXT).map(([k, h]) => [k, text(cell(r, h))])),
      ...Object.fromEntries(Object.entries(DATES).map(([k, h]) => [k, sheetDate(cell(r, h))])),
    } as HrStaffRow);
  }
  return [...byId.values()];
}

export const isLeft = (s: HrStaffRow) => /nghỉ/i.test(s.status) || !!s.end_date;
export const ageOn = (birth: string, today: string) => { const a = Number(today.slice(0, 4)) - Number(birth.slice(0, 4)); return today.slice(5) < birth.slice(5) ? a - 1 : a; };
/** "2 năm 3 tháng" from the start date to the leaving date (or today). */
export function tenureText(start: string | null, end: string | null, today: string) {
  if (!start) return "";
  const to = end ?? today;
  const months = Math.max(0, (Number(to.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(start.slice(5, 7)) - (to.slice(8) < start.slice(8) ? 1 : 0));
  return `${Math.floor(months / 12)} năm ${months % 12} tháng`;
}
const AGES: [string, number, number][] = [["Dưới 18", 0, 17], ["18 - 30", 18, 30], ["31 - 40", 31, 40], ["41 - 50", 41, 50], ["51 - 60", 51, 60], ["Trên 60", 61, 200]];
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
/** Counts per label, "Lễ tân" and "Lễ Tân" being one (the first spelling is shown). */
const tally = (items: string[]) => {
  const out = new Map<string, [string, number]>();
  for (const label of items.map((k) => k.trim() || "Chưa cập nhật")) { const e = out.get(label.toLowerCase()) ?? [label, 0]; e[1]++; out.set(label.toLowerCase(), e); }
  return [...out.values()].sort((a, b) => b[1] - a[1]);
};

/** Dashboard figures of the staff still working on `today` (yyyy-mm-dd), plus joiners and leavers of the last 12 months and what falls due soon. */
export function summarizeStaff(all: HrStaffRow[], today: string) {
  const active = all.filter((s) => !isLeft(s));
  const ages = active.flatMap((s) => (s.birth_date ? [ageOn(s.birth_date, today)] : []));
  const nextBirthday = (birth: string) => { const y = Number(today.slice(0, 4)); const this_ = `${y}-${birth.slice(5)}`; return this_ >= today ? this_ : `${y + 1}-${birth.slice(5)}`; };
  const upcoming = (pick: (s: HrStaffRow) => string | null, within: number) => active.flatMap((s) => { const d = pick(s); const left = d ? daysBetween(today, d) : -1; return d && left >= 0 && left <= within ? [{ s, date: d, days: left }] : []; }).sort((a, b) => a.days - b.days);
  const months = Array.from({ length: 12 }, (_, i) => { const t = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - (11 - i), 1)); return t.toISOString().slice(0, 7); });
  return {
    total: all.length, active: active.length, left: all.length - active.length,
    female: active.filter((s) => /^nữ/i.test(s.gender)).length, male: active.filter((s) => /^nam/i.test(s.gender)).length,
    avgAge: ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : null,
    byUnit: tally(active.map((s) => s.unit)), byDepartment: tally(active.map((s) => s.department)), byEducation: tally(active.map((s) => s.education)),
    ageRanges: AGES.map(([label, lo, hi]) => [label, ages.filter((a) => a >= lo && a <= hi).length] as [string, number]),
    monthly: months.map((m) => ({ month: m, joined: all.filter((s) => s.start_date?.startsWith(m)).length, left: all.filter((s) => s.end_date?.startsWith(m)).length })),
    birthdays: upcoming((s) => (s.birth_date ? nextBirthday(s.birth_date) : null), 30),
    contractsDue: upcoming((s) => s.contract_end, 60),
    probationsDue: upcoming((s) => s.probation_end, 30),
  };
}
