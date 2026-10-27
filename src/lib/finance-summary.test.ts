import test from "node:test";
import assert from "node:assert/strict";
import { parseLedger } from "./bluejay-reconcile.ts";
import { financeReport, ledgerBalances, parseExpenses, reportGroup, summarizeFinance } from "./finance-summary.ts";

const ledgerRows = [
  ["BẢNG KÊ THU TIỀN KHÁCH SẠN"],
  ["NGÀY THÁNG", "ID HỆ THỐNG", "NỀN TẢNG", "Thanh toán", "DỊCH VỤ", "NỘI DUNG", "SỐ PHÒNG TT", "TIỀN CỌC ĐÃ NHẬN", "", "", "THU TIỀN KHÁCH SẠN", "", "", "", "", "", "Tổng tiền", "GIẢM TRỪ DOANH THU"],
  ["", "", "", "", "", "", "", "Cọc tiền mặt Đã ở", "Cọc tiền TK Đã ở", "Cọc tiền thẻ Đã ở", "Tiền măt", "Cọc tiền TM chưa ở", "Tiền TK", "Cọc tiền TK chưa ở", "Tiền quẹt thẻ", "Tiền POS cafe", "", "Hoa hồng nền tảng", "Các khoản giảm trừ khác"],
  [46235, "009691", "Khách Lẻ", "TT trực tiềp", "Minibar", "", 203, "", "", "", 35000, "", 20000, "", "", 5000, 0, "", ""],
  [46235, "2519808162", "Expedia", "TT OTA", "Tiền phòng", "", 102, 100, 200, 300, "", 7, "", 9, 400, "", 0, 50, 6],
  [46236, "", "Lãi tiền gửi", "", "Tiền TK", "", "", "", "", "", "", "", 19487, "", "", "", 0, "", ""],
];
const expenseRows = [
  ["CHI KHÁCH SẠN", "", "", "", "", "", "Khoản giảm trừ doanh thu"],
  ["Ngày", "Hạng mục", "Nội dung chi", "chi Tiền mặt", "Chi Tiền CK", "Chi Tiền CK thẻ visa", "Hoa hồng nền tảng", "Phí quẹt thẻ"],
  ["", "", "", 450000, 0, 0, 0, 0], // the sheet's own total row: no date
  [46235, "Chi sửa chữa – Bảo dưỡng", "Thay aptomat", 450000, "", "", "", ""],
  [46236, "Chi dịch vụ ngoài – phần mềm QL", "Kế toán", "", 4342000, "", "", ""], // dash written differently from the list
  [46236, "Chi lạ", "không có trong danh mục", 1000, "", "", "", ""],
  [46237, "Chi Marketing – OTA", "Hoa hồng traveloka", "", "", "", 375870, ""],
];

test("income is split by fund (deposits of staying guests included), advances and POS apart, rows without an id kept", () => {
  const { entries } = parseLedger(ledgerRows);
  assert.equal(entries.length, 3);
  const s = summarizeFinance(entries, []);
  assert.deepEqual(s.income.taken, { cash: 35000 + 100, bank: 20000 + 200 + 19487, card: 300 + 400, total: 35100 + 39687 + 700 });
  assert.deepEqual(s.income.advance, { cash: 7, bank: 9, card: 0, total: 16 });
  assert.equal(s.income.pos, 5000);
  assert.equal(s.income.commission, 50);
  assert.equal(s.income.otherDeduction, 6);
});

test("expenses are read by column name, summed by kind and fund, commission is not a payment, unknown kinds are reported", () => {
  const lines = parseExpenses(expenseRows);
  assert.equal(lines.length, 4);
  const s = summarizeFinance([], lines);
  assert.deepEqual(s.expense.total, { cash: 451000, bank: 4342000, visa: 0, all: 4793000 });
  assert.equal(s.expense.byKind.find((k) => k.code === "CP03")!.cash, 450000);
  assert.equal(s.expense.byKind.find((k) => k.code === "CP12")!.bank, 4342000);
  assert.equal(s.expense.byKind.find((k) => k.code === "CP13")!.total, 0);
  assert.deepEqual(s.expense.unlisted, [{ row: 6, kind: "Chi lạ", amount: 1000 }]);
  assert.throws(() => parseExpenses([["Ngày", "Số tiền"]]), /Hạng mục/);
});

test("a range cuts both ledgers, the daily rows and the fund movement follow", () => {
  const s = summarizeFinance(parseLedger(ledgerRows).entries, parseExpenses(expenseRows), { from: "2026-08-02", to: "2026-08-02" });
  assert.equal(s.income.taken.total, 19487);
  assert.equal(s.expense.total.all, 4342000 + 1000);
  const all = summarizeFinance(parseLedger(ledgerRows).entries, parseExpenses(expenseRows));
  assert.deepEqual(all.funds, { cash: 35100 + 7 - 451000 - 100, bank: 39687 + 9 - 4342000 - 200, card: 700 - 300 });
  assert.deepEqual(all.daily.map((d) => d.date), ["2026-08-01", "2026-08-02", "2026-08-03"]);
});

test("money moved between the hotel's own funds stays in the funds but is not takings by service, platform or day, nor a cost", () => {
  const entries = parseLedger([
    ledgerRows[0], ledgerRows[1], ledgerRows[2],
    [46235, "009691", "Khách Lẻ", "TT trực tiềp", "Minibar", "", 203, "", "", "", 35000, "", "", "", "", "", 0, "", ""],
    [46236, "", "", "", "Thu khác", "Luân chuyển tiền từ tài khoản sang visa", "", "", "", "", "", "", "", "", 10000000, "", 0, "", ""],
  ]).entries;
  const lines = parseExpenses([expenseRows[1], [46236, "Chi rút tiền – Điều chuyển tiền", "chuyển sang visa", "", 10000000, "", "", ""], [46237, "Chi khác", "x", 1000, "", "", "", ""]]);
  const s = summarizeFinance(entries, lines);
  assert.equal(s.income.transfer, 10000000);
  assert.equal(s.income.taken.total, 10035000); // still in taken: the fund table needs it
  assert.deepEqual(s.income.byService, [{ name: "Minibar", total: 35000 }]);
  assert.deepEqual(s.daily.map((d) => [d.income, d.expense]), [[35000, 0], [0, 1000]]);
  assert.equal(s.expense.transfer, 10000000);
  assert.equal(s.expense.total.all, 10001000);
  assert.deepEqual(s.funds, { cash: 35000 - 1000, bank: -10000000, card: 10000000 });
});

test("the weekly report: revenue by service without fee rows, new money without deposits and transfers, cost without transfers, weeks add up to the period", () => {
  const entries = parseLedger([
    ledgerRows[0], ledgerRows[1], ledgerRows[2],
    [46235, "009700", "Khách Lẻ", "TT trực tiềp", "Tiền phòng", "", 101, 200, "", "", 1000, "", "", "", "", "", 0, "", ""], // Sat 1 Aug: deposit of a guest already staying + cash
    [46235, "", "", "", "", "Hoa hồng traveloka", "", "", "", "", "", "", -5000, "", "", "", 0, 5000, ""], // commission as a negative amount, and again in the deduction column
    [46237, "009701", "Khách Lẻ", "TT trực tiềp", "Minibar", "", 102, "", "", "", "", "", 35000, "", "", "", 0, "", ""], // Mon 3 Aug
    [46237, "", "", "", "Thu khác", "Luân chuyển tiền sang visa", "", "", "", "", "", "", "", "", 700, "", 0, "", ""],
  ]).entries;
  const lines = parseExpenses([expenseRows[1],
    [46237, "Chi nhân sự – BHXH", "lương", 100, "", "", "", ""],
    [46237, "Chi hoàn tiền KH", "hoàn cọc", "", 50, "", "", ""],
    [46237, "Chi rút tiền – Điều chuyển tiền", "sang visa", "", 700, "", "", ""]]);
  const r = financeReport(entries, lines, { from: "2026-08-01", to: "2026-08-03" });
  assert.deepEqual(r.columns.map((c) => [c.label, c.from, c.to]), [["Tuần 31", "2026-08-01", "2026-08-02"], ["Tuần 32", "2026-08-03", "2026-08-03"], ["Cả kỳ", "2026-08-01", "2026-08-03"]]);
  const row = (label: string) => r.rows.find((x) => x.label.includes(label))!.values;
  assert.deepEqual(row("Tiền phòng"), [1200, 0, 1200]); // 1000 cash + 200 deposit
  assert.deepEqual(row("Minibar"), [0, 35000, 35000]);
  assert.deepEqual(row("Thu khác"), [0, 0, 0]); // the card transfer and the commission row are not revenue
  assert.deepEqual(row("Giảm trừ"), [-5000, 0, -5000]);
  assert.deepEqual(row("1. THU THEO DỊCH VỤ"), [1200 - 5000, 35000, 1200 - 5000 + 35000]);
  assert.deepEqual(row("Thu tiền mặt"), [1000, 0, 1000]); // the deposit was received earlier
  assert.deepEqual(row("2. TỔNG TIỀN THU"), [1000 - 5000, 35000, 1000 - 5000 + 35000]); // the bank column carries -5000: the commission taken off a payout
  assert.deepEqual(row("3. TỔNG CHI"), [0, 150, 150]);
  assert.deepEqual(row("Điều chuyển vào"), [0, 700, 700]);
  assert.deepEqual(row("Điều chuyển ra"), [0, 700, 700]);
});

test("report groups follow the accountant's: the words of a line decide where an expense that straddles groups goes", () => {
  const g = (kind: string, note: string, list = "Chi dịch vụ ngoài & nộp thuế") => reportGroup(kind, note, list);
  assert.equal(g("Chi thuế – Pháp lý – PCCC", "Chi thuế nhà thầu tháng 7"), "Chi phí vận hành");
  assert.equal(g("Chi thuế – Pháp lý – PCCC", "Công an khu vực"), "Chi phí khác");
  assert.equal(g("Chi thuế – Pháp lý – PCCC", "Nộp thuế GTGT quý 3"), "Chi dịch vụ ngoài & nộp thuế");
  assert.equal(g("Chi Marketing – OTA", "Hoa hồng Traveloka"), "Chi phí vận hành");
  assert.equal(g("Chi Marketing – OTA", "MKT book phòng tháng 7"), "Chi dịch vụ ngoài & nộp thuế");
  assert.equal(g("Chi điện nước – Viễn thông, phí dv", "Phí quẹt thẻ khách mã 123"), "Chi phí vận hành");
  assert.equal(g("Chi điện nước – Viễn thông, phí dv", "Thanh toán phí dịch vụ SMS"), "Chi phí khác");
  assert.equal(g("Chi điện nước – Viễn thông, phí dv", "Tiền điện tháng 7"), "Chi dịch vụ ngoài & nộp thuế");
  assert.equal(g("Chi dịch vụ ngoài - phần mềm QL", "thưởng DV ngoài tháng 7"), "Chi phí nhân sự");
  assert.equal(g("Chi dịch vụ ngoài - phần mềm QL", "Gia hạn bluejay 12 tháng"), "Chi phí khác");
  assert.equal(g("Chi dịch vụ ngoài - phần mềm QL", "Tiền rác tháng 8"), "Chi dịch vụ ngoài & nộp thuế");
  assert.equal(g("Chi sửa chữa – Bảo dưỡng", "x", "Chi phí đầu tư, sự kiện"), "Chi phí đầu tư, sự kiện"); // every other expense keeps its group in the list
});

test("the report counts an unlisted expense in its own row, so its total always equals the expense total; lines outside the period are counted, not silently dropped", () => {
  const entries = parseLedger([ledgerRows[0], ledgerRows[1], ledgerRows[2], [46235, "009700", "Khách Lẻ", "TT trực tiềp", "Tiền phòng", "", 101, "", "", "", 1000, "", "", "", "", "", 0, "", ""]]).entries;
  const lines = parseExpenses([expenseRows[1],
    [46235, "Chi khác", "x", 100, "", "", "", ""],
    [46235, "Chi lạ", "không có trong danh mục", 7, "", "", "", ""],
    [46300, "Chi khác", "sau kỳ", 5, "", "", "", ""],
    [46235, "Chi Marketing – OTA", "hoa hồng", "", "", "", 40, ""]]);
  const range = { from: "2026-08-01", to: "2026-08-02" };
  const s = summarizeFinance(entries, lines, range);
  assert.deepEqual(s.outside, { incomeLines: 0, expenseLines: 1, expenseAmount: 5 });
  assert.equal(s.expense.commission, 40);
  const r = financeReport(entries, lines, range);
  const row = (label: string) => r.rows.find((x) => x.label.includes(label))!.values.at(-1);
  assert.equal(row("Chưa phân loại"), 7);
  assert.equal(row("3. TỔNG CHI"), s.expense.total.all); // 107: the unclassified 7 is in the total
  assert.equal(s.income.byService[0].name, "Tiền phòng");
});

test("an expense sheet without the commission and card fee columns still reads (they are kept in the income sheet)", () => {
  const rows = expenseRows.map((r) => r.slice(0, 6)); // the two deduction columns cut off
  const lines = parseExpenses(rows);
  assert.equal(lines.length, 4);
  assert.deepEqual(lines.map((l) => [l.commission, l.cardFee]), [[0, 0], [0, 0], [0, 0], [0, 0]]);
  assert.equal(lines[0].cash, 450000);
});

test("the balances typed at the top of a ledger tab: a label and its number in one of the next two cells, the first tab that has it wins, text is not a number", () => {
  const rows = [["BẢNG KÊ", "", "Đầu kỳ tiền mặt", 1000, "Đầu kỳ ngân hàng", "", 5000], ["", "CUỐI KỲ TIỀN MẶT", "", 2000, "Cuối kỳ ngân hàng", "1.000"]];
  assert.deepEqual(ledgerBalances([{ rows }, { rows: [["Đầu kỳ tiền mặt", 9]] }]), { openCash: 1000, closeCash: 2000, openBank: 5000, closeBank: null });
  assert.deepEqual(ledgerBalances([{ rows: [["x"], [], [], [], ["Đầu kỳ tiền mặt", 7]] }]), { openCash: null, closeCash: null, openBank: null, closeBank: null }); // only the first rows are read
});
