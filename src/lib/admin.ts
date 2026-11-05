// Roles come from app_metadata.role, set with the service role (users cannot edit it): "admin" (everything), "hr" (Nhân sự and Tuyển dụng) and "mkt" (Review and Tiếp cận, read-only).
// The same rules are enforced in the database (supabase/migrations/20261015010000_admin_only_access.sql, 20261029010000_mkt_read_only.sql) and for /api by apiAllowed in src/proxy.ts.
type Who = { app_metadata?: Record<string, unknown> } | null | undefined;
export const isAdmin = (user: Who) => user?.app_metadata?.role === "admin";
export const isHr = (user: Who) => user?.app_metadata?.role === "hr";
export const isMkt = (user: Who) => user?.app_metadata?.role === "mkt";
/** May sign in at all. */
export const canUse = (user: Who) => isAdmin(user) || isHr(user) || isMkt(user);

/** The Kênh and Quảng cáo pages' APIs. */
export const REACH_APIS = ["/api/facebook", "/api/instagram", "/api/tiktok", "/api/facebook-ads", "/api/google-ads", "/api/google-analytics", "/api/google-profile"];
/** The review refresh of the Đánh giá pages. */
export const CRAWL_APIS = ["/api/crawl", "/api/crawl/bulk"];
/** The APIs of the Hành chính nhân sự pages. */
export const HR_APIS = ["/api/nhan-su", "/api/hr", "/api/assets"];

/** What an account may call under /api: admin everything; hr every API of the Hành chính nhân sự pages, mkt every API of the Marketing pages (read and write). */
export function apiAllowed(user: Who, method: string, path: string) {
  if (isAdmin(user)) return true;
  if (isHr(user)) return HR_APIS.includes(path);
  if (isMkt(user)) return REACH_APIS.includes(path) || CRAWL_APIS.includes(path);
  return false;
}
