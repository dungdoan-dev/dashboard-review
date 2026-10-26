import test from "node:test";
import assert from "node:assert/strict";
import { ID_PATTERN, cleanFields, formValues, isEntity } from "./hr-forms.ts";

test("cleanFields keeps only the form's keys and checks them", () => {
  assert.deepEqual(cleanFields("need", { dept: " Bếp ", pos: "Phụ bếp", qty: "2", date: "2026-10-01", evil: "x" }), { dept: "Bếp", pos: "Phụ bếp", qty: "2", date: "2026-10-01" });
  assert.throws(() => cleanFields("need", { dept: "Bếp", pos: "", qty: "2" }), /Thiếu vị trí/);
  assert.throws(() => cleanFields("need", { dept: "Bếp", pos: "x", qty: "-1" }), /số nguyên/);
  assert.throws(() => cleanFields("cand", { name: "An", dob: "01/02/2000" }), /ngày hợp lệ/);
  assert.throws(() => cleanFields("intv", { cand: "UV-0001", date: "2026-10-01", time: "9h" }), /giờ hợp lệ/);
  assert.throws(() => cleanFields("staff", null), /không hợp lệ/);
});

test("formValues turns the sheet's dd/mm/yyyy into input dates and maps renamed keys", () => {
  const intv = formValues("intv", { candId: "UV-0001", date: "05/11/2026", time: "09:00", round: "Vòng 1" });
  assert.deepEqual([intv.cand, intv.date, intv.time, intv.round, intv.place], ["UV-0001", "2026-11-05", "09:00", "Vòng 1", ""]);
  assert.equal(formValues("need", { title: "TP", date: "10/10/2026" }).pos, "TP");
});

test("entity and id checks", () => {
  assert.equal(isEntity("cand"), true);
  assert.equal(isEntity("constructor"), false);
  assert.deepEqual(["YC-001", "UV-0001", "x", "UV-1;drop"].map((id) => ID_PATTERN.test(id)), [true, true, false, false]);
});
