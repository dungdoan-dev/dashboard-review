import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAdmin, isHr } from "@/lib/admin";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  // API routes are admin-only (cron routes are excluded by the matcher and use CRON_SECRET). Pages gate on the client; data is gated by RLS.
  const path = request.nextUrl.pathname;
  const hrAllowed = isHr(data?.claims) && ((path === "/api/nhan-su" && request.method === "GET") || path === "/api/hr"); // what an hr account may call: the staff list (read) and recruitment (read and write)
  if (path.startsWith("/api/") && !isAdmin(data?.claims) && !hrAllowed) {
    return NextResponse.json({ message: "Chỉ tài khoản admin được truy cập." }, { status: 403 });
  }
  return response;
}
