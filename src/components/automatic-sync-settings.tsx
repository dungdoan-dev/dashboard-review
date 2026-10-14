"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Clock3, FlaskConical, LoaderCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { LocationRecord } from "@/lib/types";

export type SyncLocationType = "hotel" | "cafe" | "mart";
const typeText: Record<SyncLocationType, { title: string; noun: string }> = {
  hotel: { title: "Đồng bộ khách sạn hằng ngày", noun: "khách sạn" },
  cafe: { title: "Đồng bộ cafe hằng ngày", noun: "cơ sở cafe" },
  mart: { title: "Đồng bộ Mart 24h hằng ngày", noun: "cơ sở Mart 24h" },
};

type Run = { location_id: string; report_date: string; status: string; message: string | null; started_at: string };

type TestResult = { name: string; allOk: boolean; results: Array<{ platform: string; ok: boolean; rating?: number | null; count?: number | null; rank?: string | null; error?: string; seconds: number }> };
const sourceLabels: Record<string, string> = { google: "Google Maps", tripadvisor: "Tripadvisor", agoda: "Agoda", booking: "Booking.com", expedia: "Expedia", tripcom: "Trip.com", traveloka: "Traveloka", grabfood: "GrabFood" };

export function AutomaticSyncSettings({ userId, locations, locationType = "hotel" }: { userId: string | null; locations: LocationRecord[]; locationType?: SyncLocationType }) {
  const { title, noun } = typeText[locationType];
  const hotels = useMemo(() => locations.filter((location) => location.type === locationType), [locations, locationType]);
  const [enabled, setEnabled] = useState(false);
  const [hour, setHour] = useState(2);
  const [queue, setQueue] = useState<string[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(Boolean(userId));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [testId, setTestId] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testError, setTestError] = useState("");

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const db = createClient();
    Promise.all([
      db.from("automatic_sync_settings").select("enabled,run_hour,location_ids").eq("owner_id", userId).eq("location_type", locationType).maybeSingle(),
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
  }, [userId, locationType]);

  const validQueue = queue.filter((id) => hotels.some((hotel) => hotel.id === id));
  const available = hotels.filter((hotel) => !validQueue.includes(hotel.id));

  async function save() {
    if (!userId) return;
    if (enabled && validQueue.length === 0) {
      setMessage(`Chọn ít nhất một ${noun} trước khi bật lịch chạy.`);
      return;
    }
    setSaving(true);
    setMessage("");
    const { error } = await createClient().rpc("save_automatic_sync_settings", {
      p_enabled: enabled, p_run_hour: hour, p_location_ids: validQueue, p_location_type: locationType,
    });
    setSaving(false);
    setMessage(error ? error.message : "Đã lưu lịch đồng bộ.");
  }

  async function runTest() {
    if (!testId) return;
    setTesting(true);
    setTestResult(null);
    setTestError("");
    try {
      const response = await fetch("/api/hotel-sync/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locationId: testId }) });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) setTestError(data?.message ?? `Lỗi HTTP ${response.status}`);
      else setTestResult(data);
    } catch (error) {
      setTestError(error instanceof Error ? error.message : String(error));
    } finally {
      setTesting(false);
    }
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...validQueue];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    setQueue(next);
  }

  const typeRuns = runs.filter((run) => hotels.some((hotel) => hotel.id === run.location_id));

  return <section className="automatic-sync-section" id={`settings-automatic-sync-${locationType}`} aria-labelledby={`automatic-sync-title-${locationType}`}>
    <div className="automatic-sync-heading"><div className="section-kicker"><Clock3 size={14} /> CÀI ĐẶT · TỰ ĐỘNG</div><h2 id={`automatic-sync-title-${locationType}`}>{title}</h2><p>Chạy lần lượt theo hàng đợi. Nguồn nào lấy được số liệu thì được lưu và chốt sổ ngay; nguồn lỗi bị bỏ qua và báo ở chuông thông báo trên header.</p></div>
    {!userId ? <p className="form-hint">Kết nối Supabase và đăng nhập để dùng lịch tự động.</p> : loading ? <p>Đang tải cấu hình…</p> : <div className="automatic-sync-controls">
      <label className="automatic-sync-toggle"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span>Bật đồng bộ tự động</span></label>
      <label className="field">Khung giờ chạy mỗi ngày (giờ Việt Nam)<select value={hour} onChange={(event) => setHour(Number(event.target.value))}>{Array.from({ length: 24 }, (_, value) => <option key={value} value={value}>{String(value).padStart(2, "0")}:00–{String((value + 1) % 24).padStart(2, "0")}:00</option>)}</select></label>
      <div className="automatic-sync-queue"><strong>Hàng đợi cơ sở</strong><p>Thêm {noun}, sau đó dùng mũi tên để đổi thứ tự chạy.</p>
        {validQueue.map((id, index) => <div className="automatic-sync-row" key={id}><span className="automatic-sync-number">{index + 1}</span><span>{hotels.find((hotel) => hotel.id === id)?.name}</span><div className="automatic-sync-actions"><button type="button" className="icon-button" aria-label={`Đưa ${hotels.find((hotel) => hotel.id === id)?.name} lên`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={16} /></button><button type="button" className="icon-button" aria-label={`Đưa ${hotels.find((hotel) => hotel.id === id)?.name} xuống`} disabled={index === validQueue.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} /></button><button type="button" className="button button-outline" onClick={() => setQueue(validQueue.filter((item) => item !== id))}>Bỏ</button></div></div>)}
        {available.length > 0 && <label className="field">Thêm {noun}<select value="" onChange={(event) => { if (event.target.value) setQueue([...validQueue, event.target.value]); }}><option value="">Chọn cơ sở…</option>{available.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}</select></label>}
        {!hotels.length && <p>Chưa có {noun} nào.</p>}
      </div>
      <div className="automatic-sync-test"><strong>Chạy thử</strong><p>Cào lần lượt các nguồn của một cơ sở giống lịch tự động để xem lỗi ngay. Chỉ hiển thị kết quả, không lưu số liệu và không chốt sổ. Có thể mất vài phút.</p>
        <div className="automatic-sync-test-controls"><select aria-label="Chọn cơ sở để chạy thử" value={testId} onChange={(event) => setTestId(event.target.value)}><option value="">Chọn cơ sở…</option>{hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}</select>
          <button type="button" className="button button-outline" onClick={() => void runTest()} disabled={!testId || testing}>{testing ? <LoaderCircle size={16} className="spin" /> : <FlaskConical size={16} />}{testing ? "Đang chạy thử…" : "Chạy thử"}</button></div>
        {testError && <p role="alert" className="automatic-sync-test-error">{testError}</p>}
        {testResult && <div className="automatic-sync-test-result" role="status"><strong>{testResult.name} · {testResult.allOk ? "Tất cả nguồn thành công" : "Có nguồn lỗi"}</strong>{testResult.results.map((item) => <div key={item.platform} className={item.ok ? "ok" : "fail"}><span>{item.ok ? "✓" : "✗"} {sourceLabels[item.platform] ?? item.platform}</span><span>{item.ok ? [item.rating != null ? `điểm ${item.rating}` : null, item.count != null ? `${item.count} đánh giá` : null, item.rank].filter(Boolean).join(" · ") : item.error} · {item.seconds}s</span></div>)}</div>}
      </div>
      <div className="automatic-sync-footer"><button className="button button-primary" type="button" onClick={() => void save()} disabled={saving}>{saving && <LoaderCircle size={16} className="spin" />}Lưu lịch đồng bộ</button>{message && <span role="status">{message}</span>}</div>
      {typeRuns.length > 0 && <div className="automatic-sync-history"><strong>Lần chạy gần đây</strong>{typeRuns.slice(0, 5).map((run, index) => <div key={`${run.location_id}-${run.report_date}-${index}`}><span>{hotels.find((hotel) => hotel.id === run.location_id)?.name ?? "Cơ sở đã xóa"} · {run.report_date}</span><span>{run.status === "success" ? "Đã chốt" : run.status === "partial" ? "Chốt một phần" : run.status === "failed" ? "Lỗi" : "Đang chạy"}{run.message ? ` · ${run.message}` : ""}</span></div>)}</div>}
    </div>}
  </section>;
}
