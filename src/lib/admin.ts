// Only accounts with app_metadata.role = "admin" may use the app. app_metadata is set with the service role; users cannot edit it.
// The same rule is enforced in the database (supabase/migrations/20261015010000_admin_only_access.sql) and for /api in src/proxy.ts.
export const isAdmin = (user: { app_metadata?: Record<string, unknown> } | null | undefined) => user?.app_metadata?.role === "admin";
