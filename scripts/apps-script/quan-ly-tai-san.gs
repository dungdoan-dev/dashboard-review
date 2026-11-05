/**
 * Ứng dụng web đọc / ghi file Google Sheet "Quản lý tài sản" cho dashboard (trang Tài sản, /api/assets).
 *
 * Cài (một lần):
 *   1. Mở dự án Apps Script, xóa code cũ, dán file này, Lưu.
 *   2. Cài đặt dự án (bánh răng) > Thuộc tính tập lệnh > Thêm: ASSET_TOKEN = một chuỗi ngẫu nhiên dài (ví dụ 40 ký tự).
 *   3. Triển khai > Triển khai mới > Loại: Ứng dụng web. Thực thi với tư cách: Tôi. Người có quyền truy cập: Bất kỳ ai. Cấp quyền khi được hỏi.
 *   4. Dashboard > Cài đặt > Khóa API: dán URL ứng dụng web (…/exec) vào "Tài sản · địa chỉ" và ASSET_TOKEN vào "Tài sản · mã truy cập".
 *   Sửa code sau này: Triển khai > Quản lý bản triển khai > Sửa (bút chì) > Phiên bản: Mới, để URL giữ nguyên.
 *
 * Quy tắc ghi:
 *   - Chỉ ghi các cột nhập tay (nền xanh đậm) trong TA_TABS. Cột công thức (nền xám) không bao giờ bị ghi đè.
 *   - Thêm: dùng dòng trống đầu tiên (cột mã trống) từ dòng 4; hết dòng thì thêm dòng mới ở cuối và chép công thức của dòng trên.
 *   - Sửa / xóa theo số dòng, kèm mã đang thấy trên web: mã trong sheet khác thì từ chối (sheet đã đổi, cần tải lại).
 *   - Xóa = xóa nội dung các ô nhập tay của dòng, giữ công thức để các dòng khác không lệch.
 * Tên hàm đều bắt đầu bằng TA_ (doGet / doPost là tên bắt buộc của ứng dụng web).
 */
var TA_SHEET_ID = '1Wd_qdI__p1oDGurwkCU31qfhc9XoBAymlPaCcE3_pVc';
var TA_HEADER_ROW = 3, TA_FIRST_ROW = 4;
// tab: tên sheet, cột nhập tay, mã có phải duy nhất không (Kiểm kê: một đợt nhiều dòng).
var TA_TABS = {
  ts: { name: 'Tài sản', inputs: 'A B C E F G H I J K L N O P Q R S T', unique: true },
  bg: { name: 'Bàn giao', inputs: 'A B C D F G J K L M N P', unique: true },
  mt: { name: 'Mượn trả', inputs: 'A B D F G H I L', unique: true },
  bt: { name: 'Bảo trì', inputs: 'A B D E F G H I J K L', unique: true },
  kk: { name: 'Kiểm kê', inputs: 'A B C F G H I', unique: false },
  tl: { name: 'Thanh lý', inputs: 'A B D E F I K L', unique: true },
  loai: { name: 'Loại tài sản', inputs: 'A B C D E F', unique: true },
  nv: { name: 'Nhân viên', inputs: 'A B C D E F G H', unique: true },
};

function TA_col(letter) { var n = 0; for (var i = 0; i < letter.length; i++) n = n * 26 + letter.charCodeAt(i) - 64; return n; }
function TA_inputs(tab) { return tab.inputs.split(' ').map(TA_col); }
function TA_json(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function TA_checkToken(token) {
  var want = PropertiesService.getScriptProperties().getProperty('ASSET_TOKEN');
  if (!want) throw new Error('Chưa đặt ASSET_TOKEN trong Thuộc tính tập lệnh.');
  if (String(token || '') !== want) throw new Error('Sai mã truy cập.');
}
function TA_sheet(tab) {
  var sh = SpreadsheetApp.openById(TA_SHEET_ID).getSheetByName(tab.name);
  if (!sh) throw new Error('Không thấy tab "' + tab.name + '".');
  return sh;
}

// Tiêu đề hàng 3 và các dòng có mã (cột A), giá trị như sheet hiển thị.
function TA_read(tab) {
  var sh = TA_sheet(tab), width = sh.getLastColumn(), last = sh.getLastRow();
  var headers = sh.getRange(TA_HEADER_ROW, 1, 1, width).getDisplayValues()[0];
  while (headers.length && !String(headers[headers.length - 1]).trim()) headers.pop();
  var rows = [];
  if (last >= TA_FIRST_ROW && headers.length) {
    var values = sh.getRange(TA_FIRST_ROW, 1, last - TA_FIRST_ROW + 1, headers.length).getDisplayValues();
    for (var i = 0; i < values.length; i++) if (String(values[i][0]).trim()) rows.push({ row: TA_FIRST_ROW + i, cells: values[i] });
  }
  return { headers: headers, inputs: TA_inputs(tab), rows: rows };
}

function doGet(e) {
  try {
    TA_checkToken(e.parameter.token);
    if (e.parameter.action !== 'data') throw new Error('Hành động không hợp lệ.');
    var out = { tabs: {} };
    Object.keys(TA_TABS).forEach(function (key) { out.tabs[key] = TA_read(TA_TABS[key]); });
    var dm = SpreadsheetApp.openById(TA_SHEET_ID).getSheetByName('Danh mục');
    out.lists = dm && dm.getLastRow() >= TA_FIRST_ROW ? dm.getRange(TA_FIRST_ROW, 1, dm.getLastRow() - TA_FIRST_ROW + 1, 23).getDisplayValues() : [];
    return TA_json(out);
  } catch (err) { return TA_json({ error: err.message }); }
}

// "2026-11-05" thành ngày; số không có số 0 đầu thành số; chuỗi số có số 0 đầu (điện thoại, số hóa đơn) giữ là chữ.
function TA_value(v) {
  v = String(v == null ? '' : v).trim();
  var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (d) return new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]));
  if (/^(0|[1-9]\d{0,14})(\.\d+)?$/.test(v)) return Number(v);
  if (/^0\d+$/.test(v) || /^[=+\-@]/.test(v)) return "'" + v; // giữ số 0 đầu; không cho chuỗi thành công thức
  return v;
}

function TA_findKey(sh, key, skipRow) {
  var last = sh.getLastRow();
  if (last < TA_FIRST_ROW) return 0;
  var keys = sh.getRange(TA_FIRST_ROW, 1, last - TA_FIRST_ROW + 1, 1).getDisplayValues();
  for (var i = 0; i < keys.length; i++) if (TA_FIRST_ROW + i !== skipRow && String(keys[i][0]).trim() === key) return TA_FIRST_ROW + i;
  return 0;
}

// Dòng trống đầu tiên; không còn thì thêm dòng ở cuối với công thức của dòng trên.
function TA_freeRow(sh, inputs) {
  var last = sh.getLastRow();
  if (last >= TA_FIRST_ROW) {
    var keys = sh.getRange(TA_FIRST_ROW, 1, last - TA_FIRST_ROW + 1, 1).getDisplayValues();
    for (var i = 0; i < keys.length; i++) if (!String(keys[i][0]).trim()) return TA_FIRST_ROW + i;
  }
  var row = Math.max(last + 1, TA_FIRST_ROW);
  if (row > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 50);
  if (last >= TA_FIRST_ROW) {
    var formulas = sh.getRange(last, 1, 1, sh.getLastColumn()).getFormulasR1C1()[0];
    for (var c = 0; c < formulas.length; c++) if (formulas[c] && inputs.indexOf(c + 1) < 0) sh.getRange(row, c + 1).setFormulaR1C1(formulas[c]);
  }
  return row;
}

// { token, tab, action: "save" | "delete", row?, key?, values?: { "A": "...", ... } }
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var body = JSON.parse(e.postData.contents);
    TA_checkToken(body.token);
    var tab = TA_TABS[body.tab];
    if (!tab) throw new Error('Tab không hợp lệ.');
    lock.waitLock(20000);
    var sh = TA_sheet(tab), inputs = TA_inputs(tab), row = Number(body.row) || 0;
    if (row) {
      if (row < TA_FIRST_ROW || row > sh.getLastRow()) throw new Error('Dòng không hợp lệ.');
      if (String(sh.getRange(row, 1).getDisplayValue()).trim() !== String(body.key || '')) throw new Error('Dòng này vừa bị thay đổi trên Google Sheet. Bấm Làm mới rồi thử lại.');
    }
    if (body.action === 'delete') {
      if (!row) throw new Error('Thiếu dòng cần xóa.');
      sh.getRangeList(inputs.map(function (c) { return sh.getRange(row, c).getA1Notation(); })).clearContent();
      return TA_json({ ok: true, row: row });
    }
    if (body.action !== 'save') throw new Error('Hành động không hợp lệ.');
    var values = body.values || {}, key = String(values.A || '').trim();
    if (!key) throw new Error('Thiếu mã (cột đầu).');
    if (tab.unique && TA_findKey(sh, key, row)) throw new Error('Mã ' + key + ' đã có trong tab ' + tab.name + '.');
    if (!row) row = TA_freeRow(sh, inputs);
    inputs.forEach(function (c) {
      var letter = tab.inputs.split(' ')[inputs.indexOf(c)];
      if (Object.prototype.hasOwnProperty.call(values, letter)) sh.getRange(row, c).setValue(TA_value(values[letter]));
    });
    return TA_json({ ok: true, row: row });
  } catch (err) {
    return TA_json({ error: err.message });
  } finally {
    lock.releaseLock();
  }
}
