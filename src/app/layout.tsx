import type { Metadata } from "next";
import { ReviewdeskApp } from "@/components/reviewdesk-app";
import "./globals.css";

export const metadata: Metadata = {
  title: "VJH Dashboard — Vận hành và đánh giá đa cơ sở",
  description: "Theo dõi đánh giá, vận hành khách sạn, doanh thu và chỉ số tiếp cận của các cơ sở.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

  return <html lang="vi" data-scroll-behavior="smooth"><body><ReviewdeskApp supabaseConfigured={configured} />{children}</body></html>;
}
