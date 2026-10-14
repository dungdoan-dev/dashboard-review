import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Chromium nén (bin/*.br) được đọc lúc chạy trên Vercel nên phải đưa vào bundle của các API route.
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/@sparticuz/chromium/bin/**/*"],
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
