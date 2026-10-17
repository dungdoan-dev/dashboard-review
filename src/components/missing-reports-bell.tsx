"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardList } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PLATFORM_LABELS } from "@/lib/platforms";
import type { Platform } from "@/lib/types";

// Nguồn cần chốt mỗi ngày: nguồn có liên kết chỉ tính khi đã gắn liên kết; GrabFood và ShopeeFood không có liên kết nên luôn tính.
const EXPECTED: Record<"hotel" | "fnb", { linked: Platform[]; always: Platform[] }> = {
  hotel: { linked: ["booking", "tripcom", "agoda", "expedia", "traveloka"], always: [] },
  fnb: { linked: ["google", "tripadvisor"], always: ["grabfood", "shopeefood"] },
};
const ALL_PLATFORMS = [...new Set(Object.values(EXPECTED).flatMap((e) => [...e.linked, ...e.always]))];
type Missing = { id: string; name: string; platforms: Platform[] };
type Tracked = { id: string; name: string; kind: "hotel" | "fnb" };

function todayInVietnam() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()); // YYYY-MM-DD
}

/** Icon ở header: các nguồn của khách sạn (OTA) và Cafe/Mart 24h hôm nay chưa chốt báo cáo ngày. */
export function MissingReportsBell({ userId, locations }: { userId: string | null; locations: Tracked[] }) {
  const [open, setOpen] = useState(false);
  const [missing, setMissing] = useState<Missing[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const locationKey = locations.map((location) => `${location.id}|${location.kind}|${location.name}`).join("\n");

  const fetchMissing = useCallback(async (): Promise<Missing[] | null> => {
    const tracked: Tracked[] = locationKey ? locationKey.split("\n").map((row) => { const [id, kind, ...name] = row.split("|"); return { id, kind: kind as Tracked["kind"], name: name.join("|") }; }) : [];
    if (!tracked.length) return [];
    const ids = tracked.map((location) => location.id);
    const db = createClient();
    const [links, done] = await Promise.all([
      db.from("location_platforms").select("location_id,platform,url").in("location_id", ids).in("platform", ALL_PLATFORMS),
      db.from("daily_report_snapshots").select("location_id,platform").eq("report_date", todayInVietnam()).in("location_id", ids).in("platform", ALL_PLATFORMS),
    ]);
    if (links.error || done.error) return null; // giữ kết quả cũ khi lỗi mạng
    const finalized = new Set((done.data ?? []).map((row) => `${row.location_id}:${row.platform}`));
    return tracked.flatMap(({ id, name, kind }) => {
      const hasLink = (platform: Platform) => (links.data ?? []).some((link) => link.location_id === id && link.platform === platform && String(link.url ?? "").trim());
      const platforms = [...EXPECTED[kind].linked.filter(hasLink), ...EXPECTED[kind].always].filter((platform) => !finalized.has(`${id}:${platform}`));
      return platforms.length ? [{ id, name, platforms }] : [];
    });
  }, [locationKey]);

  const load = useCallback(() => fetchMissing().then((result) => { if (result) setMissing(result); }), [fetchMissing]);

  useEffect(() => {
    if (!userId) return;
    void load();
    const timer = window.setInterval(() => void load(), 120_000);
    return () => window.clearInterval(timer);
  }, [userId, load]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  if (!userId) return null;
  const total = missing.reduce((sum, hotel) => sum + hotel.platforms.length, 0);
  return <div className="notification-bell" ref={root}>
    <button type="button" className="icon-button notification-trigger" aria-label={`Báo cáo hôm nay còn thiếu ${total} nguồn`} aria-expanded={open} aria-haspopup="dialog" onClick={() => { setOpen((value) => !value); if (!open) void load(); }}>
      <ClipboardList size={18} />{total > 0 && <span className="notification-badge missing-badge">{total > 99 ? "99+" : total}</span>}
    </button>
    {open && <div className="notification-panel" role="dialog" aria-label="Báo cáo còn thiếu hôm nay">
      <div className="notification-panel-head"><strong>Chưa chốt hôm nay</strong></div>
      {missing.length === 0 ? <p className="notification-empty">Đã chốt đủ các nguồn hôm nay.</p> : <ul className="notification-list">
        {missing.map((hotel) => <li key={hotel.id} className="notification-item unread"><div className="notification-body missing-item">
          <strong>{hotel.name}</strong><small>{hotel.platforms.map((platform) => PLATFORM_LABELS[platform]).join(", ")}</small></div></li>)}
      </ul>}
    </div>}
  </div>;
}
