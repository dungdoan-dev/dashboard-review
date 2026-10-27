import test from "node:test";
import assert from "node:assert/strict";
import { parseStaff, sheetDate, summarizeStaff, tenureText } from "./hr-staff.ts";

const serial = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000 + 25_569; // days since 1899-12-30

test("dates read as Excel serials or dd/mm/yyyy, anything else is null", () => {
  assert.equal(sheetDate(serial("1984-06-26")), "1984-06-26");
  assert.equal(sheetDate("5/3/2026"), "2026-03-05");
  assert.equal(sheetDate("31/02/2026"), null);
  assert.equal(sheetDate(""), null);
  assert.equal(sheetDate("abc"), null);
});

test("staff are found by header name whatever the column order, no private fields are kept, a repeated id keeps the last row", () => {
  const rows = [
    [], ["DANH SÁCH"],
    ["Số CCCD", "Họ và tên", "Mã số NV", "Phòng ban", "Ngày sinh", "Trạng thái", "Ngày nghỉ việc", "Địa chỉ tạm trú", "Số điện thoại", "Số tài khoản", "Lương hiện tại"],
    ["031084000284", "An", "X-1", "IT", serial("1990-05-10"), "🟢 Đang làm", "", "12 Lê Lợi", "0912345678", "19033987263330", 9000000],
    ["", "Bình", "X-2", "SM", "", "🔴 Đã nghỉ", serial("2026-09-30"), "", "", "", ""],
    ["", "", "", "", "", "", "", "", "", "", ""],
    ["", "An đổi tên", "X-1", "IT", serial("1990-05-10"), "🟢 Đang làm", "", "12 Lê Lợi", "0912345678", "19033987263330", 9000000],
  ];
  const staff = parseStaff(rows, "VJH");
  assert.deepEqual(staff.map((s) => [s.unit, s.staff_id, s.name, s.department, s.birth_date, s.end_date]), [["VJH", "X-1", "An đổi tên", "IT", "1990-05-10", null], ["VJH", "X-2", "Bình", "SM", null, "2026-09-30"]]);
  assert.deepEqual([staff[0].address, staff[0].phone, staff[1].address], ["12 Lê Lợi", "0912345678", ""]); // "Địa chỉ tạm trú" is an address header too
  for (const private_ of ["031084000284", "19033987263330", "9000000"]) assert.ok(!JSON.stringify(staff).includes(private_)); // ID card, bank account and salary are not kept
  assert.throws(() => parseStaff([["a", "b"]], "VJH"), /Mã số NV/);
});

test("summary counts the people still working, ages on the day, birthdays and leavers", () => {
  const s = (o: Record<string, unknown>) => ({ unit: "A", staff_id: String(o.staff_id), name: "", department: "IT", position: "", level: "", job_type: "", gender: "Nữ", birth_date: null, start_date: null, end_date: null, status: "🟢 Đang làm", marital: "", education: "", hiring_source: "", contract_type: "", contract_end: null, probation_status: "", probation_end: null, leave_reason: "", ...o }) as Parameters<typeof summarizeStaff>[0][number];
  const all = [
    s({ staff_id: "1", birth_date: "1996-11-02", start_date: "2026-10-05", contract_end: "2026-12-01" }), // still 29 on 2026-10-27, birthday in 6 days
    s({ staff_id: "2", gender: "Nam", birth_date: "1990-10-27" }),                                       // turns 36 today
    s({ staff_id: "3", status: "🔴 Đã nghỉ", end_date: "2026-10-01", birth_date: "1980-01-01" }),
  ];
  const r = summarizeStaff(all, "2026-10-27");
  assert.deepEqual([r.total, r.active, r.left, r.female, r.male, r.avgAge], [3, 2, 1, 1, 1, 32.5]);
  assert.deepEqual(r.birthdays.map((b) => [b.s.staff_id, b.days]), [["2", 0], ["1", 6]]);
  assert.deepEqual(r.contractsDue.map((b) => b.s.staff_id), ["1"]);
  assert.deepEqual(r.monthly.at(-1), { month: "2026-10", joined: 1, left: 1 });
  assert.equal(r.ageRanges.find(([l]) => l === "31 - 40")?.[1], 1);
});

test("tenure counts whole months to the leaving date or today", () => {
  assert.equal(tenureText("2024-08-15", null, "2026-10-27"), "2 năm 2 tháng");
  assert.equal(tenureText("2024-08-28", null, "2026-10-27"), "2 năm 1 tháng");
  assert.equal(tenureText("2026-08-01", "2026-09-15", "2026-10-27"), "0 năm 1 tháng");
  assert.equal(tenureText(null, null, "2026-10-27"), "");
});
