"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Clock3, LoaderCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { LocationRecord } from "@/lib/types";

type Run = { location_id: string; report_date: string; status: string; message: string | null; started_at: string };

export function AutomaticSyncSettings({ userId, locations }: { userId: string | null; locations: LocationRecord[] }) {
  const hotels = useMemo(() => locations.filter((location) => location.type === "hotel"), [locations]);
  const [enabled, setEnabled] = useState(false);
  const [hour, setHour] = useState(2);
  const [queue, setQueue] = useState<string[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(Boolean(userId));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const db = createClient();
    Promise.all([
      db.from("automatic_sync_settings").select("enabled,run_hour,location_ids").eq("owner_id", userId).maybeSingle(),
      db.from("automatic_sync_runs").select("location_id,report_date,status,message,started_at").eq("owner_id", userId).order("started_at", { ascending: false }).limit(20),
    ]).then(([settings, history]) => {
      if (!active) return;
      if (settings.error || history.error) setMessage(settings.error?.message ?? history.error?.message ?? "Không tải được cấu hình.");
      if (settings.data) {
        setEnabled(settings.data.enabled);
        setHour(settings.data.run_hour);
        setQueue(settings.data.location_ids ?? []);
      }
      setRuns(history.data ?? []);
      setLoading(false);
    });
    return () => { active = false; };
  }, [userId]);

  const validQueue = queue.filter((id) => hotels.some((hotel) => hotel.id === id));
  const available = hotels.filter((hotel) => !validQueue.includes(hotel.id));

  async function save() {
    if (!userId) return;
    if (enabled && validQueue.length === 0) {
      setMessage("Chọn ít nhất một khách sạn trước khi bật lịch chạy.");
      return;
    }
    setSaving(true);
    setMessage("");
    const { error } = await createClient().rpc("save_automatic_sync_settings", {
      p_enabled: enabled, p_run_hour: hour, p_location_ids: validQueue,
    });
    setSaving(false);
    setMessage(error ? error.message : "Đã lưu lịch đồng bộ.");
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...validQueue];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    setQueue(next);
  }

  return <section className="automatic-sync-section" id="settings-automatic-sync" aria-labelledby="automatic-sync-title">
    <div className="automatic-sync-heading"><div className="section-kicker"><Clock3 size={14} /> CÀI ĐẶT · TỰ ĐỘNG</div><h2 id="automatic-sync-title">Đồng bộ khách sạn hằng ngày</h2><p>Chạy lần lượt theo hàng đợi. Chỉ tự chốt sổ cho cơ sở khi tất cả nguồn đã kết nối đồng bộ và lưu số liệu thành công.</p></div>
    {!userId ? <p className="form-hint">Kết nối Supabase và đăng nhập để dùng lịch tự động.</p> : loading ? <p>Đang tải cấu hình…</p> : <div className="automatic-sync-controls">
      <label className="automatic-sync-toggle"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span>Bật đồng bộ tự động</span></label>
      <label className="field">Khung giờ chạy mỗi ngày (giờ Việt Nam)<select value={hour} onChange={(event) => setHour(Number(event.target.value))}>{Array.from({ length: 24 }, (_, value) => <option key={value} value={value}>{String(value).padStart(2, "0")}:00–{String((value + 1) % 24).padStart(2, "0")}:00</option>)}</select></label>
      <div className="automatic-sync-queue"><strong>Hàng đợi cơ sở</strong><p>Thêm khách sạn, sau đó dùng mũi tên để đổi thứ tự chạy.</p>
        {validQueue.map((id, index) => <div className="automatic-sync-row" key={id}><span className="automatic-sync-number">{index + 1}</span><span>{hotels.find((hotel) => hotel.id === id)?.name}</span><div className="automatic-sync-actions"><button type="button" className="icon-button" aria-label={`Đưa ${hotels.find((hotel) => hotel.id === id)?.name} lên`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={16} /></button><button type="button" className="icon-button" aria-label={`Đưa ${hotels.find((hotel) => hotel.id === id)?.name} xuống`} disabled={index === validQueue.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} /></button><button type="button" className="button button-outline" onClick={() => setQueue(validQueue.filter((item) => item !== id))}>Bỏ</button></div></div>)}
        {available.length > 0 && <label className="field">Thêm khách sạn<select value="" onChange={(event) => { if (event.target.value) setQueue([...validQueue, event.target.value]); }}><option value="">Chọn cơ sở…</option>{available.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}</select></label>}
        {!hotels.length && <p>Chưa có cơ sở loại khách sạn.</p>}
      </div>
      <div className="automatic-sync-footer"><button className="button button-primary" type="button" onClick={() => void save()} disabled={saving}>{saving && <LoaderCircle size={16} className="spin" />}Lưu lịch đồng bộ</button>{message && <span role="status">{message}</span>}</div>
      {runs.length > 0 && <div className="automatic-sync-history"><strong>Lần chạy gần đây</strong>{runs.slice(0, 5).map((run, index) => <div key={`${run.location_id}-${run.report_date}-${index}`}><span>{hotels.find((hotel) => hotel.id === run.location_id)?.name ?? "Cơ sở đã xóa"} · {run.report_date}</span><span>{run.status === "success" ? "Đã chốt" : run.status === "failed" ? "Lỗi" : "Đang chạy"}{run.message ? ` · ${run.message}` : ""}</span></div>)}</div>}
    </div>}
  </section>;
}
