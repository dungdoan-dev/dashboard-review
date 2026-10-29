// Roles an admin can give in Cài đặt → Phân quyền (stored in app_metadata.role, read by src/lib/admin.ts).
export const ROLES = [
  { value: "admin", label: "Admin", note: "Dùng được mọi chức năng và vào Cài đặt." },
  { value: "hr", label: "Nhân sự", note: "Trang Nhân sự (chỉ xem) và Tuyển dụng (xem, sửa)." },
  { value: "mkt", label: "Marketing", note: "Review và Tiếp cận, chỉ xem." },
] as const;
export type Role = (typeof ROLES)[number]["value"];
export const isRole = (v: unknown): v is Role => ROLES.some((r) => r.value === v);

/** Why an admin may not set `role` ("" = remove the access) on `targetId`, or null when it is fine. Own role stays: nobody can lock the last admin out. */
export function roleChangeError(actorId: string, targetId: string, role: unknown): string | null {
  if (typeof targetId !== "string" || !targetId) return "Thiếu tài khoản cần đổi.";
  if (role !== "" && !isRole(role)) return "Vai trò không hợp lệ.";
  if (actorId === targetId) return "Không đổi được quyền của chính mình.";
  return null;
}
