import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { EXPENSE_RULES } from "./expense-rules.ts";
import { EXPENSES } from "./expense-kinds.ts";

// The matcher is the code of the Apps Script file itself, run here with Node (the file only declares functions; nothing of Google is called).
const sandbox: { KC_match?: (text: unknown, rules: [string, string, boolean][]) => string | null } = {};
vm.runInNewContext(readFileSync(new URL("../../scripts/apps-script/hang-muc-chi.gs", import.meta.url), "utf8") + "\nthis.KC_match = KC_match;", sandbox);
const match = (text: string) => sandbox.KC_match!(text, EXPENSE_RULES);
const NAMES = new Set(EXPENSES.map((e) => e[1]));

test("every rule points at one of the 16 expenses, and no keyword is empty", () => {
  for (const [word, kind] of EXPENSE_RULES) { assert.ok(word.trim(), "empty keyword"); assert.ok(NAMES.has(kind), `${word} -> ${kind}`); }
  assert.equal(new Set(EXPENSE_RULES.map((r) => r[0].normalize("NFD"))).size, EXPENSE_RULES.length, "a keyword is listed twice");
});

test("a line is filed by the longest keyword in what is typed, accents and case ignored, word starts only", () => {
  assert.equal(match("Hoa Hồng nền tảng Traveloka"), "Chi Marketing – OTA");
  assert.equal(match("THANH TOAN TIEN DIEN THANG 9"), "Chi điện nước – Viễn thông, phí dv");
  assert.equal(match("Mỳ tôm và cà phê nhân viên"), "Chi nhân sự – BHXH"); // "nhân viên" beats "cà phê"
  assert.equal(match("Thay hộp mực máy in"), "Chi khác"); // "hộp mực" beats "thay"
  assert.equal(match("Chi thuế nhà thầu tháng 7"), "Chi thuế – Pháp lý – PCCC");
  assert.equal(match("Chi tiền sửamáy bơm nước (thay bơm)"), "Chi sửa chữa – Bảo dưỡng"); // typos glued to the keyword still match at the word start
  assert.equal(match("Pinterest quảng cáo"), "Chi Marketing – OTA"); // "pin " is a whole-word keyword: it does not catch "Pinterest"
  assert.equal(match("Chuyển tiền sang tài khoản visa"), "Chi rút tiền – Điều chuyển tiền");
  assert.equal(match("DV kt Sline tháng 7 và phí ck 22k"), "Chi dịch vụ ngoài - phần mềm QL"); // the bank fee is a weak keyword
  assert.equal(match("Phí chuyển khoản hoa hồng expedia"), "Chi Marketing – OTA");
  assert.equal(match("Phí chuyển khoản 22k"), "Chi điện nước – Viễn thông, phí dv"); // alone, the weak keyword decides
  assert.equal(match("5 bộ dây sen, 10 vòi xịt nhà vệ sinh"), "Chi sửa chữa – Bảo dưỡng"); // same length as "vệ sinh": the one that comes first in the text
  assert.equal(match("khoản gì đó không rõ"), null);
  assert.equal(match(""), null);
});
