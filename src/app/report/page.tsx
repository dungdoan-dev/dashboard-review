import { ReviewdeskApp } from "@/components/reviewdesk-app";

export default function ReportPage() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

  return <ReviewdeskApp supabaseConfigured={configured} />;
}
