import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reviewdesk — Quản lý đánh giá đa cơ sở",
  description: "Theo dõi điểm sao và số lượng đánh giá của các cơ sở trên Google Maps và Tripadvisor.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi" data-scroll-behavior="smooth"><body>{children}</body></html>;
}
