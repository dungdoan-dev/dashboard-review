"use client";

import { useEffect, useState } from "react";
import { Check, LoaderCircle, Upload, X } from "lucide-react";
import type { LocationRecord } from "@/lib/types";
import { fmtDate, fmtDateTime, parseDmy } from "@/lib/format-date";
import { DatePicker } from "@/components/date-picker";

export type ShopeefoodRow = { locationId: string; rating: number; reviewCount: number };

const vnToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

/**
 * ShopeeFood has no crawler. One button per business type opens a popup listing every branch of that type:
 * type rating and review count for the branches that have a number, pick the date, save them all at once.
 */
export function ShopeefoodImportButton({ label, locations, onSave }: {
  label: string;
  locations: LocationRecord[];
  onSave: (rows: ShopeefoodRow[], date: string) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(vnToday());
  const [dateText, setDateText] = useState(() => fmtDate(vnToday()));
  const [values, setValues] = useState<Record<string, { rating: string; count: string }>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !saving) setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving]);

  function show() {
    setValues({}); setError(""); setDone(""); setDate(vnToday()); setDateText(fmtDate(vnToday()));
    setOpen(true);
  }
  const set = (id: string, field: "rating" | "count", value: string) => setValues((current) => ({ ...current, [id]: { ...(current[id] ?? { rating: "", count: "" }), [field]: value } }));

  async function submit() {
    const today = vnToday();
    if (!date || date > today) return setError("Chọn ngày hợp lệ, không quá hôm nay (dd/mm/yyyy).");
    const rows: ShopeefoodRow[] = [];
    for (const location of locations) {
      const v = values[location.id];
      const ratingText = v?.rating.trim() ?? "", countText = v?.count.trim() ?? "";
      if (!ratingText && !countText) continue; // branch left blank: skipped
      const rating = Number(ratingText.replace(",", ".")), reviewCount = Number(countText.replace(/[.\s]/g, ""));
      if (!ratingText || !Number.isFinite(rating) || rating < 0 || rating > 5) return setError(`${location.name}: điểm phải từ 0 đến 5 (ví dụ 4,7).`);
      if (!countText || !Number.isInteger(reviewCount) || reviewCount < 0) return setError(`${location.name}: số đánh giá phải là số nguyên không âm.`);
      rows.push({ locationId: location.id, rating: Math.round(rating * 10) / 10, reviewCount });
    }
    if (!rows.length) return setError("Nhập số liệu cho ít nhất một chi nhánh.");
    setSaving(true); setError("");
    const failure = await onSave(rows, date);
    setSaving(false);
    if (failure) return setError(failure);
    setDone(`Đã lưu ShopeeFood ngày ${fmtDate(date)} cho ${rows.length} chi nhánh.`);
    setValues({});
  }

  return <>
    <button type="button" className="button button-outline shopee-open" onClick={show}><Upload size={15} /> Nhập ShopeeFood · {label}</button>
    {open && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setOpen(false); }}>
      <section className="modal-card shopee-modal" role="dialog" aria-modal="true" aria-labelledby="shopee-title">
        <header className="modal-header">
          <div><span className="section-kicker">NHẬP THỦ CÔNG</span><h2 id="shopee-title">ShopeeFood · {label}</h2><p>Nhập điểm (0–5) và số đánh giá hiện tại. Chi nhánh để trống sẽ được bỏ qua.</p></div>
          <button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Đóng"><X size={16} /></button>
        </header>
        {error && <div className="modal-error" role="alert">{error}</div>}
        {done && <div className="shopee-done" role="status"><Check size={15} /> {done}</div>}
        <div className="shopee-body">
          <label className="shopee-date"><span>Ngày số liệu</span>
            <DatePicker label="Ngày số liệu" text={dateText} onText={(text) => { setDateText(text); setDate(parseDmy(text) ?? ""); }} max={vnToday()} />
          </label>
          {locations.length === 0 ? <p className="summary-note">Chưa có cơ sở loại {label}. Thêm cơ sở trong Cài đặt.</p> : <table className="shopee-table">
            <thead><tr><th>Chi nhánh</th><th>Điểm (0–5)</th><th>Số đánh giá</th><th>Hiện có</th></tr></thead>
            <tbody>{locations.map((location) => {
              const now = location.shopeefood;
              return <tr key={location.id}>
                <th scope="row">{location.name}<small>{location.area}</small></th>
                <td><input inputMode="decimal" placeholder="4,7" aria-label={`Điểm ShopeeFood ${location.name}`} value={values[location.id]?.rating ?? ""} onChange={(event) => set(location.id, "rating", event.target.value)} /></td>
                <td><input inputMode="numeric" placeholder="120" aria-label={`Số đánh giá ShopeeFood ${location.name}`} value={values[location.id]?.count ?? ""} onChange={(event) => set(location.id, "count", event.target.value)} /></td>
                <td className="shopee-current">{now ? `${now.rating == null ? "—" : String(now.rating).replace(".", ",")} · ${now.reviewCount ?? "—"} · ${fmtDateTime(now.capturedAt)}` : "—"}</td>
              </tr>;
            })}</tbody>
          </table>}
        </div>
        <footer className="modal-footer">
          <button type="button" className="button button-outline" onClick={() => setOpen(false)} disabled={saving}>{done ? "Đóng" : "Hủy"}</button>
          <button type="button" className="button button-primary" onClick={() => void submit()} disabled={saving || !locations.length}>{saving ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} Lưu tất cả</button>
        </footer>
      </section>
    </div>}
  </>;
}
