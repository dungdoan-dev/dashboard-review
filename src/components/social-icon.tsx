export type SocialPlatform = "google-maps" | "facebook" | "instagram" | "facebook-ads" | "google-ads" | "google-analytics" | "tiktok";

/** Small coloured brand marks for the reach menu (the icon set has no brand logos). */
export function SocialIcon({ platform, size = 18 }: { platform: SocialPlatform; size?: number }) {
  const svg = { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true, className: "social-icon" } as const;
  switch (platform) {
    case "google-maps":
      return <svg {...svg}><path fill="#EA4335" d="M12 1.5a7.5 7.5 0 0 0-7.5 7.5c0 5.4 7.5 13.5 7.5 13.5s7.5-8.1 7.5-13.5A7.5 7.5 0 0 0 12 1.5Z" /><circle cx="12" cy="9" r="2.9" fill="#fff" /></svg>;
    case "facebook":
      return <svg {...svg}><circle cx="12" cy="12" r="12" fill="#1877F2" /><path fill="#fff" d="m16.67 15.47.53-3.47h-3.33V9.75c0-.95.47-1.88 1.96-1.88h1.51V4.92s-1.37-.23-2.68-.23c-2.74 0-4.53 1.66-4.53 4.67V12H6.05v3.47h3.08V24h3.74v-8.53h2.8Z" /></svg>;
    case "instagram":
      return <svg {...svg}><defs><linearGradient id="ig-grad" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#FEDA75" /><stop offset=".35" stopColor="#FA7E1E" /><stop offset=".6" stopColor="#D62976" /><stop offset=".8" stopColor="#962FBF" /><stop offset="1" stopColor="#4F5BD5" /></linearGradient></defs><rect width="24" height="24" rx="6.5" fill="url(#ig-grad)" /><rect x="5" y="5" width="14" height="14" rx="4.2" fill="none" stroke="#fff" strokeWidth="1.7" /><circle cx="12" cy="12" r="3.3" fill="none" stroke="#fff" strokeWidth="1.7" /><circle cx="16.4" cy="7.6" r="1" fill="#fff" /></svg>;
    case "facebook-ads":
      return <svg {...svg}><path fill="none" stroke="#0866FF" strokeWidth="2.3" strokeLinecap="round" d="M12 12c-1.8-2.6-3.4-5-5.5-5C4.5 7 3 9.2 3 12s1.5 5 3.5 5c2.1 0 3.7-2.4 5.5-5s3.4-5 5.5-5c2 0 3.5 2.2 3.5 5s-1.5 5-3.5 5c-2.1 0-3.7-2.4-5.5-5Z" /></svg>;
    case "google-ads":
      return <svg {...svg}><rect x="9.4" y="1.5" width="5.2" height="16" rx="2.6" fill="#4285F4" transform="rotate(30 12 12)" /><rect x="9.4" y="6.5" width="5.2" height="16" rx="2.6" fill="#FBBC04" transform="rotate(-30 12 12)" /><circle cx="5.6" cy="18.6" r="3.2" fill="#34A853" /></svg>;
    case "google-analytics":
      return <svg {...svg}><rect x="16" y="2" width="5.5" height="20" rx="2.75" fill="#F9AB00" /><rect x="9.25" y="9" width="5.5" height="13" rx="2.75" fill="#E37400" /><circle cx="5" cy="19" r="2.75" fill="#E37400" /></svg>;
    case "tiktok":
      return <svg {...svg}><path fill="#111" d="M12.53.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07Z" /></svg>;
  }
}
