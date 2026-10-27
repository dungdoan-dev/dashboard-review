import type { SupabaseClient } from "@supabase/supabase-js";
import { folderSheets, readTabs } from "@/lib/google-sheets";
import { parseStaff } from "@/lib/hr-staff";

// The shared Drive folder "3.2.6 NHÂN SỰ HỆ THỐNG": one "Quản lý thông tin nhân sự <đơn vị>" file per unit (the spare-staff list and the "Bỏ" folder are not matched).
const FOLDER = process.env.HR_SHEETS_FOLDER_ID?.trim() || "1nB3jngc8NYqCCS-sRFC0H0J1v9IexxHK";
const FILE = /^Quản lý thông tin nhân sự\s+(.+)$/i;
const TAB = "Danh sách nhân viên";

/** Copies the staff of every unit file into hr_staff. A file that fails keeps its old rows and its error goes to hr_sync; the others still run. */
export async function syncHr(db: SupabaseClient) {
  const files = (await folderSheets(FOLDER)).flatMap((f) => { const unit = FILE.exec(f.name)?.[1].trim(); return unit ? [{ ...f, unit }] : []; });
  const result: Record<string, number | { error: string }> = {};
  // One file at a time: Google allows about 60 reads a minute per account.
  for (const f of files) {
    const at = new Date().toISOString();
    try {
      const tab = (await readTabs(f.id, (titles) => titles.filter((t) => t === TAB)))[0];
      if (!tab) throw new Error(`Không có tab "${TAB}".`);
      const staff = parseStaff(tab.rows, f.unit).map((s) => ({ ...s, synced_at: at }));
      if (!staff.length) throw new Error("Không có dòng nhân viên nào (giữ dữ liệu cũ)."); // an emptied file must not wipe the stored staff
      const { error } = await db.from("hr_staff").upsert(staff);
      if (error) throw new Error(error.message);
      // Rows no longer in the file (deleted or renumbered) go; the file's own rows of this run stay.
      const { error: del } = await db.from("hr_staff").delete().eq("unit", f.unit).lt("synced_at", at);
      if (del) throw new Error(del.message);
      await db.from("hr_sync").upsert({ unit: f.unit, file_id: f.id, file_name: f.name, staff_count: staff.length, error: null, synced_at: at });
      result[f.unit] = staff.length;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await db.from("hr_sync").upsert({ unit: f.unit, file_id: f.id, file_name: f.name, error: message, synced_at: at });
      result[f.unit] = { error: message };
    }
  }
  return result;
}

/** Stored staff and the last sync of each file, for the Nhân sự page. */
export async function readHr(db: SupabaseClient) {
  const [staff, sync] = await Promise.all([db.from("hr_staff").select("*").order("unit").order("staff_id").limit(5000), db.from("hr_sync").select("unit,file_name,staff_count,error,synced_at").order("unit")]);
  if (staff.error) throw new Error(staff.error.message);
  if (sync.error) throw new Error(sync.error.message);
  return { staff: staff.data, sync: sync.data };
}
