import test from "node:test";
import assert from "node:assert/strict";
import { birthdaysOf, candsOf, countBy, intvsOf, needsOf, staffOf, statusTone } from "./hr.ts";

const row = (cols: Record<number, string>) => Array.from({ length: 17 }, (_, i) => cols[i] ?? "");

test("staffOf reads the sheet's columns and skips blank rows", () => {
  const rows = [row({ 0: "NV-0001", 1: "An", 6: "Lễ tân", 10: "Chính thức", 15: "05/11", 16: "10" }), row({})];
  const [one, ...rest] = staffOf(rows);
  assert.equal(rest.length, 0);
  assert.deepEqual([one.id, one.name, one.dept, one.status, one.nextBday, one.daysLeft], ["NV-0001", "An", "Lễ tân", "Chính thức", "05/11", 10]);
  assert.equal(staffOf([row({ 0: "NV-2", 16: "" })])[0].daysLeft, null);
});

test("birthdaysOf needs an id and a name", () => {
  const [b, ...rest] = birthdaysOf([["NV-1", "", "", "", "", "", ""], ["NV-0001", "Bình", "Buồng phòng", "02/11/1995", "02/11/2026", "7", "31"]]);
  assert.equal(rest.length, 0);
  assert.deepEqual([b.dept, b.dob, b.next, b.daysLeft, b.age], ["Buồng phòng", "02/11/1995", "02/11/2026", 7, "31"]);
});

test("countBy groups and sorts high to low, blanks together", () => {
  assert.deepEqual(countBy(["a", "b", "a", ""], (x) => x), [["a", 2], ["b", 1], ["Chưa cập nhật", 1]]);
});

test("needsOf, candsOf, intvsOf read their sheet columns", () => {
  const need = needsOf([["YC-001", "10/10/2026", "Vận hành", "TP", "2", "10/11/2026", "GĐ", "30.000.000", "0", "2", "Đang tuyển", "ghi chú"]])[0];
  assert.deepEqual([need.dept, need.qty, need.status, need.note], ["Vận hành", 2, "Đang tuyển", "ghi chú"]);
  const cand = candsOf([["UV-1", "18/10/2026", "YC-001", "Vận hành", "TP", "Thịnh", "", "Nam", "090", "a@b.c", "Facebook", "Đã phỏng vấn", "http://cv", "HR"]])[0];
  assert.deepEqual([cand.name, cand.source, cand.status, cand.cv], ["Thịnh", "Facebook", "Đã phỏng vấn", "http://cv"]);
  const intv = intvsOf([["PV-1", "UV-1", "Thịnh", "TP", "Vòng 1", "20/10/2026", "09:00", "Online", "", "Mai", "Đạt"]])[0];
  assert.deepEqual([intv.round, intv.interviewer, intv.result], ["Vòng 1", "Mai", "Đạt"]);
});

test("statusTone: negatives win over the words they contain", () => {
  assert.deepEqual(["Không đạt", "Chính thức", "Hẹn phỏng vấn", "Mới nhận", "Offer", "?"].map(statusTone), ["red", "green", "azure", "orange", "purple", "gray"]);
});
