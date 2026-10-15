/** Mọi ngày hiển thị trên web theo dd/mm/yyyy (giờ Việt Nam khi đầu vào là thời điểm ISO). */
const vnParts = (iso: string) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return parts as Record<"day" | "month" | "year" | "hour" | "minute", string>;
};

/** "2026-10-15" hoặc ISO đầy đủ -> "15/10/2026". */
export function fmtDate(value: string) {
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (plain) return `${plain[3]}/${plain[2]}/${plain[1]}`;
  const p = vnParts(value);
  return `${p.day}/${p.month}/${p.year}`;
}

/** ISO -> "09:57 15/10/2026". */
export function fmtDateTime(iso: string) {
  const p = vnParts(iso);
  return `${p.hour}:${p.minute} ${p.day}/${p.month}/${p.year}`;
}

/** "15/10/2026" -> "2026-10-15"; sai định dạng hoặc ngày không có thật -> null. */
export function parseDmy(text: string) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const iso = `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}
