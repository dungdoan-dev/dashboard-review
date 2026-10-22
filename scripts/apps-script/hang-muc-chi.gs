/**
 * Tự điền cột B (Hạng mục) của các tab BK CHI khi nhập cột C (Nội dung chi).
 *
 * Cài (một lần cho mỗi Google Sheet khách sạn):
 *   1. Thêm tab "Quy tắc hạng mục" (file quy-tac-hang-muc.xlsx: cột A Từ khóa, cột B Hạng mục, cột C "Yếu"; hàng 1 là tiêu đề).
 *      Tên hạng mục ở cột B phải giống hệt tên trong ô thả xuống của cột Hạng mục.
 *   2. Tiện ích mở rộng > Apps Script (script gắn với sheet này) > dán file này > Lưu.
 *   3. Chạy hàm KC_dienTatCa một lần và cấp quyền: điền hạng mục còn trống cho các dòng đã có.
 *   Sau đó, nhập hoặc dán nội dung ở cột C, ô Hạng mục cùng dòng tự điền nếu nhận ra từ khóa.
 *
 * Cách nhận: bỏ dấu và chữ hoa, tìm từ khóa ở đầu một từ trong nội dung; từ khóa dài nhất thắng, bằng nhau thì từ khóa đứng trước trong nội dung
 * ("mì tôm cho nhân viên": "nhân viên" dài hơn "mì tôm" nên ra Chi nhân sự). Từ khóa có dấu cách ở cuối ("thay ") chỉ khớp trọn một từ.
 * Từ khóa đánh dấu "Yếu" (x ở cột C, ví dụ "phí ck") chỉ dùng khi không có từ khóa thường nào khớp: "DV kế toán và phí ck 22k" ra dịch vụ ngoài, không ra phí ngân hàng.
 * Chỉ điền khi ô Hạng mục còn trống: không đè lên hạng mục đã chọn. Không nhận ra từ khóa nào thì để trống, chọn tay.
 * Thêm hoặc sửa từ khóa ngay ở tab "Quy tắc hạng mục", không cần sửa script.
 * Tên hàm đều bắt đầu bằng KC_ (onEdit là tên bắt buộc của trình kích hoạt).
 */
var KC = { TAB: /bk\s*chi/i, RULES: 'Quy tắc hạng mục', KIND_COL: 2, ITEM_COL: 3, FIRST_ROW: 4 };

// Bỏ dấu, chữ thường, mọi ký tự không phải chữ hoặc số thành một dấu cách.
function KC_norm(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ');
}

// rules: [[từ khóa, hạng mục, yếu], ...]. Trả về hạng mục của từ khóa tốt nhất có trong text, hoặc null.
function KC_match(text, rules) {
  var t = ' ' + KC_norm(text).trim() + ' ';
  for (var pass = 0; pass < 2; pass++) { // lượt 0: từ khóa thường; lượt 1: từ khóa yếu, chỉ khi lượt 0 không ra gì
    var best = null, bestLen = 0, bestAt = 0;
    for (var i = 0; i < rules.length; i++) {
      if ((rules[i][2] ? 1 : 0) !== pass) continue;
      var k = KC_norm(rules[i][0]), kt = k.trim();
      if (!kt) continue;
      var at = t.indexOf(' ' + kt + (/ $/.test(k) ? ' ' : ''));
      if (at >= 0 && (kt.length > bestLen || (kt.length === bestLen && at < bestAt))) { best = rules[i][1]; bestLen = kt.length; bestAt = at; }
    }
    if (best) return best;
  }
  return null;
}

function KC_rules() {
  var sh = SpreadsheetApp.getActive().getSheetByName(KC.RULES);
  if (!sh) throw new Error('Thiếu tab "' + KC.RULES + '".');
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().filter(function (r) { return String(r[0]).trim() && String(r[1]).trim(); })
    .map(function (r) { return [String(r[0]), String(r[1]).trim(), String(r[2]).trim() !== '']; });
}

// Điền hạng mục cho n dòng từ dòng first. overwrite = false: chỉ dòng còn trống hạng mục.
function KC_fill(sheet, first, n, rules, overwrite) {
  var items = sheet.getRange(first, KC.ITEM_COL, n, 1).getValues(), kinds = sheet.getRange(first, KC.KIND_COL, n, 1).getValues(), changed = false;
  for (var i = 0; i < n; i++) {
    if (items[i][0] === '' || (!overwrite && String(kinds[i][0]).trim() !== '')) continue;
    var kind = KC_match(items[i][0], rules);
    if (kind) { kinds[i][0] = kind; changed = true; }
  }
  if (changed) sheet.getRange(first, KC.KIND_COL, n, 1).setValues(kinds);
}

// Trình kích hoạt đơn giản: chạy khi sửa hoặc dán vào cột C của tab BK CHI.
function onEdit(e) {
  var r = e.range, sh = r.getSheet();
  if (!KC.TAB.test(sh.getName())) return;
  if (r.getColumn() > KC.ITEM_COL || r.getLastColumn() < KC.ITEM_COL || r.getLastRow() < KC.FIRST_ROW) return;
  var first = Math.max(r.getRow(), KC.FIRST_ROW);
  KC_fill(sh, first, r.getLastRow() - first + 1, KC_rules(), false);
}

// Chạy tay một lần (và sau khi sửa tab "Quy tắc hạng mục"): điền hạng mục còn trống ở mọi tab BK CHI.
function KC_dienTatCa() {
  var rules = KC_rules();
  SpreadsheetApp.getActive().getSheets().forEach(function (sh) {
    if (!KC.TAB.test(sh.getName())) return;
    var rows = sh.getMaxRows() - KC.FIRST_ROW + 1;
    if (rows > 0) KC_fill(sh, KC.FIRST_ROW, rows, rules, false);
  });
}
