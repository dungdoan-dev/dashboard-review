import type { Metadata } from "next";
import { ReviewdeskApp } from "@/components/reviewdesk-app";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reviewdesk — Quản lý đánh giá đa cơ sở",
  description: "Theo dõi điểm sao và số lượng đánh giá của các cơ sở trên Google Maps và Tripadvisor.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

  return <html lang="vi" data-scroll-behavior="smooth"><body><ReviewdeskApp supabaseConfigured={configured} />{children}</body></html>;
}
