/**
 * Khóa tuần cho bảng kê thu tiền (4 Google Sheet).
 * Dán file này vào MỘT dự án Apps Script tạo bằng tài khoản CHỦ SỞ HỮU của cả 4 sheet,
 * rồi Triển khai (Deploy) → Ứng dụng web: "Thực thi bằng: Tôi", "Ai có quyền truy cập: Bất kỳ ai".
 * Mã bí mật nằm trong Project Settings → Script properties → TOKEN (chuỗi dài ngẫu nhiên, trùng SHEETS_LOCK_TOKEN trên Vercel).
 *
 * Web gọi 3 việc: status (tuần nào đã khóa), lock (khóa các dòng của một tuần), unlock (mở khóa tuần đó).
 * Khóa = bảo vệ dải ô A:T của các dòng có ngày thuộc tuần (thứ Hai → Chủ nhật), chỉ chủ sở hữu sửa được.
 * Dòng phải sắp theo ngày: script khóa từ dòng đầu đến dòng cuối của tuần, dòng nằm giữa cũng bị khóa.
 */

var SHEETS = {
  5381: '1HvweFPj0RlzUA3qUaBYVQOoHh8PrBLpuTvDIqIelTmU', // Sontra Sea
  6836: '1LJgUrctGwBPcynAjdHZlG4u8kbhCpuZGk4R9GWxciOk', // Vistara Gia Lai
  6495: '1b_38S409K5glxanqYGUU8IpsKroV0Gq8h5ppeK006Tc', // Vistara Quy Nhon
  6209: '15_6wGXPamuVApuTmyeUDH01J2OFHgr-d0GeTWVUhcIo'  // Yzistel Hoi An
};
var FIRST_ROW = 4;  // dòng dữ liệu đầu tiên (dòng 1-3 là tiêu đề)
var COLUMNS = 20;   // A..T
var PREFIX = 'KHOA_TUAN ';

function doPost(e) {
  try {
    var p = JSON.parse(e.postData.contents);
    var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
    if (!token || p.token !== token) return out({ ok: false, message: 'Sai mã bí mật.' });
    var id = SHEETS[p.hotel];
    if (!id) return out({ ok: false, message: 'Khách sạn chưa có trong script.' });
    if (!/^\d{4}-\d{2}$/.test(p.month || '')) return out({ ok: false, message: 'Tháng không hợp lệ.' });
    var sheet = findTab(SpreadsheetApp.openById(id), p.month);
    if (!sheet) return out({ ok: false, message: 'Không thấy tab bảng kê tháng ' + p.month + '.' });
    if (p.action === 'status') return out({ ok: true, weeks: lockedWeeks(sheet) });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.week || '')) return out({ ok: false, message: 'Tuần không hợp lệ.' });
    if (p.action === 'lock') return out(lockWeek(sheet, p.week));
    if (p.action === 'unlock') { unlockWeek(sheet, p.week); return out({ ok: true }); }
    return out({ ok: false, message: 'Việc không hợp lệ.' });
  } catch (err) {
    return out({ ok: false, message: String(err) });
  }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Tab "BK 08/2026" (hoặc 08-2026, 2026-08); sheet chỉ có một tab BK thì dùng tab đó. Giống cách web chọn tab.
function findTab(ss, month) {
  var mm = month.slice(5), yyyy = month.slice(0, 4);
  var bk = ss.getSheets().filter(function (s) { return /bk/i.test(s.getName()); });
  var named = bk.filter(function (s) {
    var n = s.getName();
    return n.indexOf(mm + '/' + yyyy) >= 0 || n.indexOf(mm + '-' + yyyy) >= 0 || n.indexOf(month) >= 0;
  });
  return named.length ? named[0] : (bk.length === 1 ? bk[0] : null);
}

function addDaysStr(s, n) {
  var d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function lockedWeeks(sheet) {
  return sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE)
    .map(function (p) { return p.getDescription(); })
    .filter(function (d) { return d.indexOf(PREFIX) === 0; })
    .map(function (d) { return d.slice(PREFIX.length); });
}

function unlockWeek(sheet, week) {
  sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) {
    if (p.getDescription() === PREFIX + week) p.remove();
  });
}

function lockWeek(sheet, week) {
  var last = sheet.getLastRow();
  if (last < FIRST_ROW) return { ok: false, message: 'Sheet chưa có dòng nào.' };
  var end = addDaysStr(week, 6);
  // Múi giờ của sheet có thể trống (sheet tạo từ bản sao): dùng múi giờ script, cuối cùng là giờ Việt Nam.
  var tz = sheet.getParent().getSpreadsheetTimeZone() || Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh';
  var dates = sheet.getRange(FIRST_ROW, 1, last - FIRST_ROW + 1, 1).getValues();
  var first = 0, lastRow = 0;
  for (var i = 0; i < dates.length; i++) {
    var d = dates[i][0];
    if (!(d instanceof Date)) continue;
    var key = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
    if (key >= week && key <= end) { if (!first) first = i + FIRST_ROW; lastRow = i + FIRST_ROW; }
  }
  if (!first) return { ok: false, message: 'Tuần này chưa có dòng nào trong tab.' };
  unlockWeek(sheet, week); // khóa lại thì thay bản cũ, không chồng hai lớp
  var protection = sheet.getRange(first, 1, lastRow - first + 1, COLUMNS).protect().setDescription(PREFIX + week);
  var me = Session.getEffectiveUser();
  protection.addEditor(me);
  protection.removeEditors(protection.getEditors()); // chỉ còn chủ sở hữu (và người chạy script)
  if (protection.canDomainEdit()) protection.setDomainEdit(false);
  return { ok: true, rows: lastRow - first + 1, fromRow: first, toRow: lastRow };
}
