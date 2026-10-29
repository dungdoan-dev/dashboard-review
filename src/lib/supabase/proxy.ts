import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { apiAllowed } from "@/lib/admin";

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
  if (path.startsWith("/api/") && !apiAllowed(data?.claims, request.method, path)) {
    return NextResponse.json({ message: "Tài khoản không có quyền gọi chức năng này." }, { status: 403 });
  }
  return response;
}
