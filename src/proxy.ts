import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

// Pages are static and gate on the client (data by RLS), so the session check only runs for the API and the auth callback; cron routes use CRON_SECRET.
export const config = {
  matcher: ["/api/((?!cron/).*)", "/auth/:path*"],
};
