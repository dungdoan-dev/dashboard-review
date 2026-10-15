"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Bell, CircleAlert, Info, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fmtDateTime } from "@/lib/format-date";

type Notice = { id: number; level: "error" | "warning" | "info"; title: string; message: string; created_at: string; read_at: string | null };

const icons = { error: <CircleAlert size={16} />, warning: <AlertTriangle size={16} />, info: <Info size={16} /> };

/** Chuông thông báo ở header: lỗi và cảnh báo từ đồng bộ tự động và cào thủ công (bảng notifications). */
export function NotificationBell({ userId }: { userId: string | null }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const root = useRef<HTMLDivElement>(null);

  const fetchNotices = useCallback(async () => {
    const db = createClient();
    const [list, count] = await Promise.all([
      db.from("notifications").select("id,level,title,message,created_at,read_at").order("created_at", { ascending: false }).limit(30),
      db.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    ]);
    return { items: list.error ? null : ((list.data ?? []) as Notice[]), unread: count.count };
  }, []);

  const load = useCallback(() => fetchNotices().then((result) => {
    if (result.items) setItems(result.items);
    if (result.unread != null) setUnread(result.unread);
  }), [fetchNotices]);

  useEffect(() => {
    if (!userId) return;
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
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

  async function markRead(id?: number) {
    let query = createClient().from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    if (id !== undefined) query = query.eq("id", id);
    await query;
    await load();
  }

  async function clearAll() {
    await createClient().from("notifications").delete().gte("id", 0);
    await load();
  }

  if (!userId) return null;
  return <div className="notification-bell" ref={root}>
    <button type="button" className="icon-button notification-trigger" aria-label={`Thông báo, ${unread} chưa đọc`} aria-expanded={open} aria-haspopup="dialog" onClick={() => { setOpen((value) => !value); if (!open) void load(); }}>
      <Bell size={18} />{unread > 0 && <span className="notification-badge">{unread > 99 ? "99+" : unread}</span>}
    </button>
    {open && <div className="notification-panel" role="dialog" aria-label="Thông báo">
      <div className="notification-panel-head"><strong>Thông báo</strong>
        <div><button type="button" className="notification-link" onClick={() => void markRead()} disabled={!unread}>Đánh dấu đã đọc</button>
          <button type="button" className="icon-button" aria-label="Xóa tất cả thông báo" title="Xóa tất cả" onClick={() => void clearAll()} disabled={!items.length}><Trash2 size={15} /></button></div></div>
      {items.length === 0 ? <p className="notification-empty">Chưa có thông báo nào.</p> : <ul className="notification-list">
        {items.map((item) => <li key={item.id} className={`notification-item ${item.level} ${item.read_at ? "read" : "unread"}`}>
          <button type="button" onClick={() => !item.read_at && void markRead(item.id)}>
            <span className="notification-icon">{icons[item.level]}</span>
            <span className="notification-body"><strong>{item.title}</strong>{item.message && <small>{item.message}</small>}<time dateTime={item.created_at}>{fmtDateTime(item.created_at)}</time></span>
          </button>
        </li>)}
      </ul>}
    </div>}
  </div>;
}
