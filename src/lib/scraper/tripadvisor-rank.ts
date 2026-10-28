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

/** The address ZenRows is asked for: tripadvisor.com.vn pages time out at ZenRows (HTTP 504 after about 3 minutes, 28/10/2026) while the same page on tripadvisor.com answers in under 10 seconds, so the Vietnamese host is swapped for the main one. The saved link is not changed. */
export function tripadvisorFetchUrl(url: string) {
  return url.replace(/^(https?:\/\/)(?:www\.)?tripadvisor\.com\.vn(?=[/?#]|$)/i, "$1www.tripadvisor.com");
}

export function extractRankLabel(value: string): string | null {
  const text = decodeHtmlText(value).replace(/\s+/g, " ").trim();
  const patterns = [
    /Số\s*#?\s*\d[\d.,]*\s+(?:trên|trong(?:\s+số)?)\s+\d[\d.,]*\s+[^|<>]{1,100}/iu,
    /Ranked\s+#?\s*\d[\d.,]*\s+of\s+\d[\d.,]*\s+[^|<>]{1,100}/i,
    new RegExp(String.raw`\d[\d.,]*\s+(?:trên|trong\s+số)\s+\d[\d.,]*\s+${RANK_UNIT}[^|<>]{0,100}`, "iu"),
    /#\s*\d[\d.,]*\s+of\s+\d[\d.,]*\s+[^|<>]{1,100}/i, // the "#" tells it from "4.9 of 5 bubbles", so any category ("Shopping in …") is taken
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
