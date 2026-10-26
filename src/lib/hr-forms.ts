// Create / edit forms of the Nhân sự page. The same field list is the whitelist of /api/hr.
import type { HrPayload } from "./hr.ts";

export type HrEntity = "need" | "cand" | "intv" | "staff";
export type FieldType = "text" | "date" | "time" | "number" | "email" | "tel" | "textarea" | "select";
/** options: a list of the payload's `opt`, or "needIds" / "candIds" (built from the sheet's own rows). */
export type FieldDef = { key: string; label: string; type: FieldType; options?: keyof NonNullable<HrPayload["opt"]> | "needIds" | "candIds"; required?: boolean; wide?: boolean };

export const HR_FORMS: Record<HrEntity, { title: string; fields: FieldDef[] }> = {
  need: { title: "nhu cầu tuyển dụng", fields: [
    { key: "dept", label: "Bộ phận", type: "select", options: "dept", required: true }, { key: "pos", label: "Vị trí", type: "text", required: true },
    { key: "qty", label: "Số lượng", type: "number", required: true }, { key: "date", label: "Ngày yêu cầu", type: "date" }, { key: "due", label: "Hạn tuyển", type: "date" },
    { key: "by", label: "Người yêu cầu", type: "text" }, { key: "salary", label: "Lương", type: "text" }, { key: "note", label: "Ghi chú", type: "textarea", wide: true },
  ] },
  cand: { title: "ứng viên", fields: [
    { key: "name", label: "Họ và tên", type: "text", required: true }, { key: "dob", label: "Ngày sinh", type: "date" }, { key: "gender", label: "Giới tính", type: "select", options: "gender" },
    { key: "phone", label: "Số điện thoại", type: "tel" }, { key: "email", label: "Email", type: "email" }, { key: "need", label: "Mã nhu cầu tuyển dụng", type: "select", options: "needIds" },
    { key: "source", label: "Nguồn ứng viên", type: "select", options: "source" }, { key: "status", label: "Trạng thái", type: "select", options: "status" },
    { key: "owner", label: "Người phụ trách", type: "text" }, { key: "cv", label: "Link CV", type: "text" }, { key: "note", label: "Ghi chú", type: "textarea", wide: true },
  ] },
  intv: { title: "lịch phỏng vấn", fields: [
    { key: "cand", label: "Ứng viên", type: "select", options: "candIds", required: true, wide: true }, { key: "round", label: "Vòng phỏng vấn", type: "select", options: "round" },
    { key: "mode", label: "Hình thức", type: "select", options: "mode" }, { key: "date", label: "Ngày", type: "date", required: true }, { key: "time", label: "Giờ", type: "time" },
    { key: "place", label: "Địa điểm / link họp", type: "text" }, { key: "interviewer", label: "Người phỏng vấn", type: "text" }, { key: "result", label: "Kết quả", type: "select", options: "result" },
    { key: "comment", label: "Nhận xét", type: "textarea", wide: true },
  ] },
  staff: { title: "nhân sự", fields: [
    { key: "name", label: "Họ và tên", type: "text", required: true }, { key: "dob", label: "Ngày sinh", type: "date" }, { key: "gender", label: "Giới tính", type: "select", options: "gender" },
    { key: "phone", label: "Số điện thoại", type: "tel" }, { key: "email", label: "Email", type: "email" }, { key: "dept", label: "Bộ phận", type: "select", options: "dept" },
    { key: "title", label: "Chức danh", type: "text" }, { key: "start", label: "Ngày vào làm", type: "date" }, { key: "status", label: "Trạng thái", type: "select", options: "staffStatus" },
    { key: "note", label: "Ghi chú", type: "textarea", wide: true },
  ] },
};

export const isEntity = (value: unknown): value is HrEntity => typeof value === "string" && Object.hasOwn(HR_FORMS, value);
export const ID_PATTERN = /^(YC|UV|PV|NV)-\d{3,5}$/;

/** "dd/mm/yyyy" (how the sheet shows a date) to the "yyyy-mm-dd" of a date input; anything else gives "". */
export const dmyToIso = (text: string) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
};

/** Values of an existing row for its edit form, keyed like HR_FORMS (the row types call the position "title" and the candidate "candId"). */
export function formValues(entity: HrEntity, row: Record<string, unknown>) {
  const read = (key: string) => String(row[key === "pos" ? "title" : key === "cand" ? "candId" : key] ?? "");
  return Object.fromEntries(HR_FORMS[entity].fields.map((f) => [f.key, f.type === "date" ? dmyToIso(read(f.key)) : read(f.key)]));
}

/** The fields of a save request that the sheet may receive: only the form's own keys, trimmed and checked by type. Throws a message for the user. */
export function cleanFields(entity: HrEntity, input: unknown): Record<string, string> {
  if (!input || typeof input !== "object") throw new Error("Dữ liệu không hợp lệ.");
  const source = input as Record<string, unknown>, out: Record<string, string> = {};
  for (const f of HR_FORMS[entity].fields) {
    const raw = source[f.key];
    const v = raw === undefined || raw === null ? "" : String(raw).trim();
    if (f.required && !v) throw new Error(`Thiếu ${f.label.toLowerCase()}.`);
    if (raw === undefined || raw === null) continue;
    if (v.length > (f.type === "textarea" ? 2000 : 300)) throw new Error(`${f.label} quá dài.`);
    if (v && f.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${f.label} không phải ngày hợp lệ.`);
    if (v && f.type === "time" && !/^\d{2}:\d{2}$/.test(v)) throw new Error(`${f.label} không phải giờ hợp lệ.`);
    if (v && f.type === "number" && !/^\d{1,4}$/.test(v)) throw new Error(`${f.label} phải là số nguyên.`);
    if (v && f.type === "email" && !/^[^\s@]+@[^\s@]+$/.test(v)) throw new Error(`${f.label} không hợp lệ.`);
    out[f.key] = v;
  }
  return out;
}
