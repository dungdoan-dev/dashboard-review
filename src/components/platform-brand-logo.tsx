import type { Platform } from "@/lib/types";

/** Compact, local SVG marks used in the branch detail platform headings. */
export function PlatformBrandLogo({ platform }: { platform: Platform }) {
  switch (platform) {
    case "google":
      return <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.51h6.44a5.5 5.5 0 0 1-2.39 3.61v2.94h3.87c2.26-2.08 3.57-5.15 3.57-8.79Z" />
        <path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.95-2.94l-3.87-2.94c-1.08.72-2.45 1.15-4.08 1.15-3.14 0-5.8-2.12-6.76-4.98H1.24v3.03A12 12 0 0 0 12 24Z" />
        <path fill="#FBBC05" d="M5.24 14.29a7.2 7.2 0 0 1 0-4.58V6.68H1.24a12 12 0 0 0 0 10.64l4-3.03Z" />
        <path fill="#EA4335" d="M12 4.73c1.77 0 3.36.61 4.61 1.82l3.45-3.45A11.55 11.55 0 0 0 12 0 12 12 0 0 0 1.24 6.68l4 3.03C6.2 6.85 8.86 4.73 12 4.73Z" />
      </svg>;
    case "tripadvisor":
      return <svg viewBox="0 0 32 24" aria-hidden="true">
        <path fill="#34E0A1" d="M3 4.5C6.3 1.7 10.7.5 16 .5s9.7 1.2 13 4c-1.2 1-2.2 2.4-2.7 4.1a9.3 9.3 0 0 1 2.4 6.2c0 4.5-3.7 8.2-8.2 8.2-2.5 0-4.8-1.1-6.3-2.9-1.5 1.8-3.8 2.9-6.3 2.9a8.2 8.2 0 0 1-5.8-14C1.6 7.3.6 6.2 0 4.9c1.1-.4 2.1-.5 3-.4Z" />
        <circle cx="9.9" cy="14.1" r="5.2" fill="#fff" /><circle cx="22.1" cy="14.1" r="5.2" fill="#fff" />
        <circle cx="10.5" cy="14.1" r="2.5" fill="#263238" /><circle cx="21.5" cy="14.1" r="2.5" fill="#263238" />
        <circle cx="11.2" cy="13.3" r=".8" fill="#fff" /><circle cx="22.2" cy="13.3" r=".8" fill="#fff" />
      </svg>;
    case "agoda":
      return <svg viewBox="0 0 32 24" aria-hidden="true">
        <path fill="#e23b49" d="M16 2.1c-5.1 0-9.2 4.1-9.2 9.2s4.1 9.2 9.2 9.2 9.2-4.1 9.2-9.2S21.1 2.1 16 2.1Zm0 4.1a5.1 5.1 0 1 1 0 10.2 5.1 5.1 0 0 1 0-10.2Z" />
        <path fill="#f5a623" d="M24.8 3.3 29 1.1l-1.1 5.1z" />
      </svg>;
    case "booking":
      return <svg viewBox="0 0 32 24" aria-hidden="true">
        <rect x="3" y="2" width="20" height="20" rx="5" fill="#003b95" />
        <path fill="#fff" d="M9 6.5h5.2c3 0 4.8 1.4 4.8 3.7 0 1.4-.7 2.4-1.9 3 1.6.5 2.5 1.7 2.5 3.3 0 2.5-2 4-5.1 4H9V6.5Zm4.8 5.6c1.2 0 1.9-.6 1.9-1.6s-.7-1.5-1.9-1.5h-1.6v3.1h1.6Zm.4 5.8c1.4 0 2.1-.6 2.1-1.7s-.8-1.7-2.1-1.7h-2v3.4h2Z" />
        <circle cx="27" cy="18" r="1.8" fill="#003b95" />
      </svg>;
    case "tripcom":
      return <svg viewBox="0 0 32 24" aria-hidden="true">
        <path fill="#287dfa" d="M11.8 3.5h3.8v3.1h3.5v3.3h-3.5v5.7c0 1.5.6 2.1 1.9 2.1.6 0 1.1-.1 1.6-.3v3.4c-.8.3-1.8.5-2.8.5-3 0-4.5-1.6-4.5-4.7V9.9H9V6.6h2.8V3.5ZM4 7h3.7v14.1H4V7Z" />
        <circle cx="5.9" cy="3.3" r="2" fill="#13b8c7" />
      </svg>;
    case "expedia":
      return <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10.5" fill="#1668e8" />
        <path fill="#fff" d="m5.2 13.3 5.1-1.4-3.1-5.6 1.5-.4 5.1 5.1 4.7-1.3c.9-.2 1.5.1 1.6.7.1.6-.4 1-1.2 1.3l-4.5 1.6-2.5 6.7-1.5.5.4-6.2-5.2 1.5-.8 1.5-1 .3.3-2.1-1.4-1.5 1-.3 1.5.6Z" />
      </svg>;
    case "traveloka":
      return <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#1686d9" d="M21.9 3.1c-.2-.8-1-1.2-1.8-.9L2.5 8.6c-1.2.4-1.3 2.1-.1 2.7l6.2 2.9 2.9 6.2c.6 1.2 2.3 1.1 2.7-.1l6.4-17.2ZM10.1 13.9l8-7.8-5.6 10.8-2.4-3Z" />
      </svg>;
    case "grabfood":
      return <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10.5" fill="#00b14f" />
        <path fill="#fff" d="M12.4 6.5c-2.9 0-5.2 2.3-5.2 5.2s2.3 5.2 5.2 5.2c1.6 0 2.9-.6 3.9-1.7v-3.4h-4.1v1.8h2c-.5.8-1.1 1.2-1.8 1.2-1.7 0-3-1.4-3-3.3s1.3-3.3 3-3.3c.9 0 1.6.4 2.2 1.1l1.4-1.3a5 5 0 0 0-3.6-1.5Z" />
      </svg>;
    default:
      return null;
  }
}
