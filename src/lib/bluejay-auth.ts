import { createClient } from "@/lib/supabase/server";
import { isAdmin, isHr, isMkt } from "@/lib/admin";

/** Admin-only, like the rest of the app (src/proxy.ts already blocks /api); kept here because this is hotel revenue. */
/** Admin or hr: the staff list of Nhân sự is read-only for hr (the sync stays admin-only); recruitment (/api/hr) is read and write. */
export async function hrViewer() {
  const { data } = await (await createClient()).auth.getUser();
  if (!data.user) return { status: 401, message: "Chưa đăng nhập." } as const;
  if (!isAdmin(data.user) && !isHr(data.user)) return { status: 403, message: "Tài khoản không có quyền nhân sự." } as const;
  return null;
}

/** Admin or mkt: the reach figures (Tiếp cận) may be read by a mkt account; pulling new figures stays bluejayViewer (admin). */
export async function reachViewer() {
  const { data } = await (await createClient()).auth.getUser();
  if (!data.user) return { status: 401, message: "Chưa đăng nhập." } as const;
  if (!isAdmin(data.user) && !isMkt(data.user)) return { status: 403, message: "Tài khoản không có quyền xem chỉ số tiếp cận." } as const;
  return null;
}

export async function bluejayViewer() {
  const { data } = await (await createClient()).auth.getUser();
  if (!data.user) return { status: 401, message: "Chưa đăng nhập." } as const;
  if (!isAdmin(data.user)) return { status: 403, message: "Chỉ tài khoản admin được xem báo cáo Blue Jay." } as const;
  return null;
}
