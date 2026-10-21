"use client";

import { useCallback, useEffect, useState } from "react";
import { BedDouble, LoaderCircle, Play, RefreshCw } from "lucide-react";
import { fmtDateTime } from "@/lib/format-date";
import { addDays, isoWeek } from "@/lib/bluejay-metrics";
import { fmtDate } from "@/lib/format-date";
import { IsoDatePicker } from "@/components/date-picker";

type Run = { id: number; week_start: string; trigger: "cron" | "manual" | "script"; status: "running" | "success" | "failed"; message: string | null; api_calls: number | null; started_at: string; finished_at: string | null };
type State = {
  settings: { enabled: boolean; backfill_from: string | null; backfill_to: string | null } | null;
  runs: Run[]; backfill: { total: number; stored: number } | null; pending: number; inWindow: boolean;
};

const TRIGGER = { cron: "Tự động", manual: "Chạy tay", script: "Script" } as const;
const STATUS = { running: "Đang chạy", success: "Thành công", failed: "Lỗi" } as const;
const weekLabel = (monday: string) => `Tuần ${isoWeek(monday)} (${fmtDate(monday)}–${fmtDate(addDays(monday, 6))})`;

async function load(): Promise<State | { message: string }> {
  const res = await fetch("/api/bluejay/sync", { cache: "no-store" }).catch(() => null);
  if (!res) return { message: "Không kết nối được máy chủ." };
  const body = await res.json().catch(() => ({}));
  return res.ok ? body : { message: body.message ?? `Lỗi HTTP ${res.status}` };
}

/** Cài đặt → Đồng bộ Blue Jay: on/off, backfill range of past weeks, "Chạy ngay" and the per-week run log. */
export function BluejaySyncSettings() {
  const [data, setData] = useState<State | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "run">("");

  const apply = useCallback((r: State | { message: string }) => {
    if ("message" in r) { setMessage(r.message); return; }
    setData(r);
    setEnabled(r.settings?.enabled ?? true);
    setFrom(r.settings?.backfill_from ?? "");
    setTo(r.settings?.backfill_to ?? "");
  }, []);

  useEffect(() => {
    let active = true;
    void load().then((r) => { if (active) apply(r); });
    return () => { active = false; };
  }, [apply]);

  async function save() {
    setBusy("save"); setMessage("");
    const res = await fetch("/api/bluejay/sync", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled, backfill_from: from || null, backfill_to: to || null }) }).catch(() => null);
    if (!res) { setMessage("Không kết nối được máy chủ."); setBusy(""); return; }
    const body = await res.json().catch(() => ({}));
    setMessage(res.ok ? "Đã lưu cấu hình đồng bộ Blue Jay." : body.message ?? `Lỗi HTTP ${res.status}`);
    if (res.ok) apply(await load());
    setBusy("");
  }

  async function runNow() {
    setBusy("run"); setMessage("");
    const res = await fetch("/api/bluejay/sync", { method: "POST" }).catch(() => null);
    if (!res) { setMessage("Không kết nối được máy chủ."); setBusy(""); return; }
    const body = await res.json().catch(() => ({}));
    setMessage(!res.ok ? body.message ?? `Lỗi HTTP ${res.status}`
      : `Đã lấy ${body.done} tuần, lỗi ${body.failed}, còn lại ${body.remaining}${body.stoppedBy === "window" ? " (hết khung giờ API)" : body.stoppedBy === "deadline" ? " (sẽ chạy tiếp ở lượt sau)" : ""}.`);
    apply(await load());
    setBusy("");
  }

  return <details className="automatic-sync-section settings-panel" id="settings-bluejay-sync" aria-labelledby="bluejay-sync-title">
    <summary className="automatic-sync-heading"><div className="section-kicker"><BedDouble size={14} /> CÀI ĐẶT · VẬN HÀNH</div><h2 id="bluejay-sync-title">Đồng bộ Blue Jay</h2><p>Tự chạy đầu mỗi khung giờ API (00:05, 08:05, 16:05 giờ VN): lấy tuần vừa xong nếu chưa có, sau đó lấy bù các tuần cũ còn thiếu trong khoảng bên dưới, rồi cập nhật tuần đang diễn ra (khoảng một lần mỗi ngày, thường vào khung giờ 16:00). Mỗi tuần được ghi một dòng log.</p></summary>
    {!data ? <p>{message || "Đang tải cấu hình…"}</p> : <div className="automatic-sync-controls">
      <label className="automatic-sync-toggle"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span>Bật đồng bộ tự động</span></label>
      <div className="automatic-sync-queue"><strong>Lấy bù các tuần cũ</strong><p>Chọn một ngày bất kỳ trong tuần đầu và tuần cuối; hệ thống tính theo tuần (thứ Hai–Chủ nhật). Để trống cả hai nếu không cần lấy bù.</p>
        <div className="field"><span>Từ tuần</span><IsoDatePicker label="Từ tuần" value={from} onChange={setFrom} /></div>
        <div className="field"><span>Đến tuần</span><IsoDatePicker label="Đến tuần" value={to} onChange={setTo} /></div>
        {data.backfill && <p>Đã có <strong>{data.backfill.stored}/{data.backfill.total}</strong> tuần trong khoảng đã lưu{data.settings?.backfill_from && data.settings.backfill_to ? ` (${weekLabel(data.settings.backfill_from)} → ${weekLabel(data.settings.backfill_to)})` : ""}.</p>}
        <p>Lượt chạy kế tiếp sẽ lấy <strong>{data.pending}</strong> tuần.</p>
      </div>
      <div className="automatic-sync-footer">
        <button className="button button-primary" type="button" onClick={() => void save()} disabled={!!busy}>{busy === "save" && <LoaderCircle size={16} className="spin" />}Lưu cấu hình</button>
        <button className="button button-outline" type="button" onClick={() => void runNow()} disabled={!!busy || !data.inWindow || !data.pending} title={data.inWindow ? undefined : "Chỉ chạy được trong khung giờ API"}>{busy === "run" ? <LoaderCircle size={16} className="spin" /> : <Play size={16} />}{busy === "run" ? "Đang lấy dữ liệu… (tối đa 4 phút)" : "Chạy ngay"}</button>
        <button className="button button-outline" type="button" onClick={() => void load().then(apply)} disabled={!!busy}><RefreshCw size={16} />Tải lại log</button>
        {message && <span role="status">{message}</span>}
      </div>
      {!data.inWindow && <p className="form-hint">Ngoài khung giờ API (00:00–00:59, 08:00–08:30, 16:00–16:59 giờ VN): “Chạy ngay” bị tắt.</p>}
      <div className="automatic-sync-history"><strong>Lần chạy gần đây</strong>
        {!data.runs.length && <p>Chưa có lần chạy nào.</p>}
        {data.runs.map((run) => <div key={run.id}>
          <span>{weekLabel(run.week_start)} · {TRIGGER[run.trigger]}</span>
          <span className={run.status === "failed" ? "fail" : undefined}>{STATUS[run.status]}{run.api_calls != null ? ` · ${run.api_calls} lần gọi API` : ""} · {fmtDateTime(run.started_at)}{run.message ? ` — ${run.message}` : ""}</span>
        </div>)}
      </div>
    </div>}
  </details>;
}
