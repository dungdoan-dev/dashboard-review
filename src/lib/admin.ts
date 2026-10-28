// Only accounts with app_metadata.role = "admin" may use the app. app_metadata is set with the service role; users cannot edit it.
// The same rule is enforced in the database (supabase/migrations/20261015010000_admin_only_access.sql) and for /api in src/proxy.ts.
export const isHr = (user: { app_metadata?: Record<string, unknown> } | null | undefined) => user?.app_metadata?.role === "hr"; // account for the Nhân sự (read-only) and Tuyển dụng pages only
/** May sign in at all: admin (everything) or hr (Nhân sự only). */
export const canUse = (user: { app_metadata?: Record<string, unknown> } | null | undefined) => isAdmin(user) || isHr(user);
export const isAdmin = (user: { app_metadata?: Record<string, unknown> } | null | undefined) => user?.app_metadata?.role === "admin";
