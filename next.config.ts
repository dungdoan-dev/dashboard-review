import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Chromium nén (bin/*.br, 67 MB) được đọc lúc chạy trên Vercel nên phải đưa vào bundle, nhưng chỉ của các route có scraper (import scraper/ hoặc hotel-sync, kể cả crawl/bulk qua ../route). Thêm route mới dùng scraper thì thêm vào đây.
  outputFileTracingIncludes: {
    "/api/crawl/**": ["./node_modules/@sparticuz/chromium/bin/**/*"],
    "/api/cron/hotel-sync/[hour]": ["./node_modules/@sparticuz/chromium/bin/**/*"],
    "/api/hotel-sync/test": ["./node_modules/@sparticuz/chromium/bin/**/*"],
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
