import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";

/** Admin-only, like the rest of the app (src/proxy.ts already blocks /api); kept here because this is hotel revenue. */
export async function bluejayViewer() {
  const { data } = await (await createClient()).auth.getUser();
  if (!data.user) return { status: 401, message: "Chưa đăng nhập." } as const;
  if (!isAdmin(data.user)) return { status: 403, message: "Chỉ tài khoản admin được xem báo cáo Blue Jay." } as const;
  return null;
}
