export function decodeHtmlText(value: string) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([\da-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)));
}

// Quán/nhà hàng ghi "3.998 trên 8.135 nhà hàng ở ..." (không có chữ "Số"), nên các mẫu không có "Số"/"Ranked"
// chỉ nhận khi theo sau là danh từ địa điểm, tránh nhầm với "4,9 trên 5 bong bóng".
const RANK_UNIT = "(?:nhà hàng|khách sạn|nhà nghỉ|quán|điểm tham quan|địa điểm|hoạt động|restaurants?|hotels?|attractions?|things to do|bed and breakfasts?|inns?)";

export function extractRankLabel(value: string): string | null {
  const text = decodeHtmlText(value).replace(/\s+/g, " ").trim();
  const patterns = [
    /Số\s*#?\s*\d[\d.,]*\s+(?:trên|trong(?:\s+số)?)\s+\d[\d.,]*\s+[^|<>]{1,100}/iu,
    /Ranked\s+#?\s*\d[\d.,]*\s+of\s+\d[\d.,]*\s+[^|<>]{1,100}/i,
    new RegExp(String.raw`\d[\d.,]*\s+(?:trên|trong\s+số)\s+\d[\d.,]*\s+${RANK_UNIT}[^|<>]{0,100}`, "iu"),
    new RegExp(String.raw`#\s*\d[\d.,]*\s+of\s+\d[\d.,]*\s+${RANK_UNIT}[^|<>]{0,100}`, "i"),
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const cleaned = match[0]
      .split(/\s+(?:truy cập|gửi|gửi|send|visit|website|điện thoại|phone|call|email)\b/i)[0]
      .replace(/\s+\+?\d[\d\s().-]{6,}$/u, "")
      .trim()
      .replace(/[.,;:]+$/, "");
    if (cleaned) return cleaned;
  }
  return null;
}
