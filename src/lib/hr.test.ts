import test from "node:test";
import assert from "node:assert/strict";
import { birthdaysOf, countBy, staffOf } from "./hr.ts";

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
