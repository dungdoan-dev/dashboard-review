const MAX_NOTICE_LENGTH = 10_000;

function normalizeHeading(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/giu, "d").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Extracts the optional Tripadvisor notice from ZenRows Markdown. */
export function extractTripadvisorNotice(markdown: string): string | null {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const start = lines.findIndex((line) => {
    const heading = line.replace(/^\s*(?:>\s*)?(?:#{1,6}\s*|[-*]\s*)?/, "").split(":", 1)[0];
    return ["thu tu tripadvisor", "a note from tripadvisor", "message from tripadvisor"].includes(normalizeHeading(heading));
  });
  if (start < 0) return null;

  const firstLine = lines[start];
  const colon = firstLine.indexOf(":");
  if (colon < 0) return null;
  const content = [firstLine.slice(colon + 1).trim()];
  for (const line of lines.slice(start + 1)) {
    if (!line.trim() || /^\s*(?:#{1,6}\s|[-*]{3,}\s*$)/.test(line)) break;
    content.push(line.trim());
  }
  const notice = content.join(" ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ").trim();
  return notice ? notice.slice(0, MAX_NOTICE_LENGTH) : null;
}
