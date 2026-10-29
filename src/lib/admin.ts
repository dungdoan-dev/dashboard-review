// Roles come from app_metadata.role, set with the service role (users cannot edit it): "admin" (everything), "hr" (Nhân sự and Tuyển dụng) and "mkt" (Review and Tiếp cận, read-only).
// The same rules are enforced in the database (supabase/migrations/20261015010000_admin_only_access.sql, 20261029010000_mkt_read_only.sql) and for /api by apiAllowed in src/proxy.ts.
type Who = { app_metadata?: Record<string, unknown> } | null | undefined;
export const isAdmin = (user: Who) => user?.app_metadata?.role === "admin";
export const isHr = (user: Who) => user?.app_metadata?.role === "hr";
export const isMkt = (user: Who) => user?.app_metadata?.role === "mkt";
/** May sign in at all. */
export const canUse = (user: Who) => isAdmin(user) || isHr(user) || isMkt(user);

/** The Tiếp cận pages' APIs: a mkt account may read them (GET), never pull (POST). */
export const REACH_APIS = ["/api/facebook", "/api/instagram", "/api/tiktok", "/api/facebook-ads", "/api/google-ads", "/api/google-analytics", "/api/google-profile"];

/** What an account may call under /api: admin everything, hr the staff list (read) and recruitment, mkt the reach figures (read). */
export function apiAllowed(user: Who, method: string, path: string) {
  if (isAdmin(user)) return true;
  if (isHr(user)) return path === "/api/hr" || (path === "/api/nhan-su" && method === "GET");
  if (isMkt(user)) return method === "GET" && REACH_APIS.includes(path);
  return false;
}
