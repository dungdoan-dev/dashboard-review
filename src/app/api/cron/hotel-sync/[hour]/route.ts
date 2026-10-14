import { createClient } from "@supabase/supabase-js";
import { DEFAULT_RATING_SCALE } from "@/lib/platforms";
import { listSources, syncSource, type SyncType } from "@/lib/hotel-sync";

export const maxDuration = 300;

function vietnamTime() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const value = (key: string) => parts.find((part) => part.type === key)?.value ?? "";
  return { date: `${value("year")}-${value("month")}-${value("day")}`, hour: Number(value("hour")) };
}

export async function GET(request: Request, context: { params: Promise<{ hour: string }> }) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const scheduledHour = Number((await context.params).hour);
  const now = vietnamTime();
  if (!Number.isInteger(scheduledHour) || scheduledHour < 0 || scheduledHour > 23 || scheduledHour !== now.hour) {
    return Response.json({ error: "invalid_schedule" }, { status: 400 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Response.json({ error: "missing_server_configuration" }, { status: 500 });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: settings, error: settingsError } = await db.from("automatic_sync_settings")
    .select("owner_id,location_type,run_hour,location_ids").eq("enabled", true).lte("run_hour", now.hour).order("run_hour");
  if (settingsError) return Response.json({ error: settingsError.message }, { status: 500 });

  const deadline = Date.now() + 240_000;
  let completed = 0;
  let failed = 0;
  for (const setting of settings ?? []) {
    for (const locationId of setting.location_ids as string[]) {
      if (Date.now() > deadline) return Response.json({ completed, failed, remaining: true });
      if (vietnamTime().date !== now.date) return Response.json({ completed, failed, remaining: true });
      const { data: previous } = await db.from("automatic_sync_runs").select("id,status,started_at")
        .eq("owner_id", setting.owner_id).eq("location_id", locationId).eq("report_date", now.date).maybeSingle();
      if (previous?.status === "success" || previous?.status === "failed") continue;
      const { data: location, error: locationError } = await db.from("locations").select("id,name,type,owner_id")
        .eq("id", locationId).eq("owner_id", setting.owner_id).eq("type", setting.location_type).maybeSingle();
      if (locationError) return Response.json({ error: locationError.message, completed, failed }, { status: 500 });
      if (!location) continue;
      let runId: number;
      if (previous) {
        if (Date.now() - new Date(previous.started_at).getTime() < 20 * 60_000) break;
        const { data: claimed } = await db.from("automatic_sync_runs")
          .update({ started_at: new Date().toISOString(), message: null })
          .eq("id", previous.id).eq("status", "running").eq("started_at", previous.started_at).select("id").maybeSingle();
        if (!claimed) break;
        runId = claimed.id;
      } else {
        const { data: claimed, error: claimError } = await db.from("automatic_sync_runs")
          .insert({ owner_id: setting.owner_id, location_id: locationId, report_date: now.date, status: "running" })
          .select("id").single();
        if (claimError || !claimed) break;
        runId = claimed.id;
      }

      try {
        const sources = await listSources(db, locationId, setting.location_type as SyncType);
        if (!sources.length) throw new Error("Cơ sở chưa có nguồn đồng bộ.");
        const metrics = [];
        const reports = [];
        for (const source of sources) {
          const platform = source.platform;
          const result = await syncSource(db, source, location);
          if (!result || !result.success || (result.ratingValue == null && result.count == null)) {
            throw new Error(`${platform}: ${result?.error ?? "không lấy được số liệu"}`);
          }
          const base = {
            location_id: location.id, platform, rating_scale: DEFAULT_RATING_SCALE[platform],
            rating_value: result.ratingValue, review_count: result.count,
            count_label: platform === "expedia" ? "nhận xét" : "đánh giá",
            tripadvisor_rank: platform === "tripadvisor" ? result.rankLabel ?? null : null,
            tripadvisor_notice: platform === "tripadvisor" ? result.tripadvisorNotice ?? null : null,
          };
          metrics.push({ ...base, source: "api", captured_at: result.capturedAt });
          reports.push({ ...base, report_date: now.date, finalized_at: new Date().toISOString(), finalized_by: setting.owner_id });
        }
        if (vietnamTime().date !== now.date) throw new Error("Lần đồng bộ vượt qua ngày mới; chưa chốt sổ.");
        const { error: metricError } = await db.from("metric_snapshots").insert(metrics);
        if (metricError) throw metricError;
        const { error: reportError } = await db.from("daily_report_snapshots").upsert(reports, { onConflict: "location_id,platform,report_date" });
        if (reportError) throw reportError;
        await db.from("automatic_sync_runs").update({ status: "success", message: `${reports.length} nguồn đã chốt sổ`, finished_at: new Date().toISOString() }).eq("id", runId);
        completed++;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        await db.from("automatic_sync_runs").update({ status: "failed", message: message.slice(0, 500), finished_at: new Date().toISOString() }).eq("id", runId);
        failed++;
      }
    }
  }
  return Response.json({ completed, failed, remaining: false });
}
