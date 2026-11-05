import { redirect } from "next/navigation";

// Báo cáo tổng hợp is now the Review part of Báo cáo marketing.
export default function SummaryPage() {
  redirect("/month");
}
