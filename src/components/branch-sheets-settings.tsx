"use client";

import { useCallback, useEffect, useState } from "react";
import { FileSpreadsheet, LoaderCircle } from "lucide-react";
import { SHEET_KINDS, type SheetKind } from "@/lib/ledger-sheets";
import { resetSheetUrls } from "@/components/use-sheet-url";

type Branch = { hotel: number; name: string; hotelUrl: string | null; fnbUrl: string | null };
type State = { serviceEmail: string; branches: Branch[] };
type Check = { name: string; ledger: string[]; stock: string[]; messages: string[] };

const key = (hotel: number, kind: SheetKind) => `${hotel}:${kind}`;
const urlOf = (b: Branch, kind: SheetKind) => (kind === "fnb" ? b.fnbUrl : b.hotelUrl) ?? "";

async function call(method: "GET" | "PUT" | "POST", body?: object) {
  const res = await fetch("/api/bluejay/branch-sheets", { method, cache: "no-store", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) }).catch(() => null);
  if (!res) return { ok: false as const, body: { message: "Không kết nối được máy chủ." } };
  return { ok: res.ok, body: await res.json().catch(() => ({})) };
}

/** Cài đặt → Link Google Sheet: the two links of every branch (hotel; Ăn sáng, cafe, mini mart), saved in the database and checked against the month's tabs. */
export function BranchSheetsSettings() {
  const [data, setData] = useState<State | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const apply = useCallback((r: Awaited<ReturnType<typeof call>>) => {
    if (!r.ok) { setMessage(r.body.message ?? "Không tải được link."); return; }
    const state = r.body as State;
    setData(state);
    setDraft(Object.fromEntries(state.branches.flatMap((b) => SHEET_KINDS.map(({ kind }) => [key(b.hotel, kind), urlOf(b, kind)]))));
  }, []);
  const load = useCallback(async () => apply(await call("GET")), [apply]);
  useEffect(() => {
    let active = true;
    void call("GET").then((r) => { if (active) apply(r); });
    return () => { active = false; };
  }, [apply]);

  async function save(b: Branch, kind: SheetKind) {
    const k = key(b.hotel, kind); setBusy(k); setNotes((n) => ({ ...n, [k]: [] }));
    const r = await call("PUT", { hotel: b.hotel, kind, link: draft[k] ?? "" });
    setNotes((n) => ({ ...n, [k]: [r.ok ? ((draft[k] ?? "").trim() ? "Đã lưu link." : "Đã xóa link.") : r.body.message ?? "Không lưu được."] }));
    if (r.ok) { resetSheetUrls(); await load(); }
    setBusy("");
  }

  async function check(b: Branch, kind: SheetKind) {
    const k = key(b.hotel, kind); setBusy(k); setNotes((n) => ({ ...n, [k]: [] }));
    const r = await call("POST", { link: draft[k] ?? "", kind, month });
    const c = r.body as Check;
    setNotes((n) => ({ ...n, [k]: r.ok ? [`Mở được “${c.name}”. Tab thu chi: ${c.ledger.join(", ") || "không có"}. Tab kho: ${c.stock.join(", ") || "không có"}.`, ...c.messages] : [r.body.message ?? "Không kiểm tra được."] }));
    setBusy("");
  }

  return <details className="automatic-sync-section settings-panel" id="settings-branch-sheets" aria-labelledby="branch-sheets-title">
    <summary className="automatic-sync-heading"><div className="section-kicker"><FileSpreadsheet size={14} /> CÀI ĐẶT · VẬN HÀNH</div><h2 id="branch-sheets-title">Link Google Sheet</h2><p>Mỗi chi nhánh có 2 link: Khách sạn (thu chi và kho) và Ăn sáng, cafe, mini mart (thu chi và kho). Dán link, bấm Lưu; bấm Kiểm tra để xem sheet có đủ tab của tháng chọn.</p></summary>
    {!data ? <p>{message || "Đang tải link…"}</p> : <div className="automatic-sync-controls">
      <p className="form-hint">Chia sẻ mỗi sheet (chỉ xem) cho <strong>{data.serviceEmail || "tài khoản đọc Google Sheet (chưa cấu hình)"}</strong> trước khi kiểm tra.</p>
      <label className="field"><span>Tháng kiểm tra</span><input type="month" value={month} onChange={(event) => event.target.value && setMonth(event.target.value)} /></label>
      {data.branches.map((b) => <div className="automatic-sync-queue" key={b.hotel}>
        <strong>{b.name}</strong>
        {SHEET_KINDS.map(({ kind, label }) => { const k = key(b.hotel, kind); return <div key={kind}>
          <label className="field"><span>{label}</span><input type="url" placeholder="https://docs.google.com/spreadsheets/d/…" value={draft[k] ?? ""} onChange={(event) => setDraft((d) => ({ ...d, [k]: event.target.value }))} /></label>
          <div className="automatic-sync-footer">
            <button className="button button-primary" type="button" onClick={() => void save(b, kind)} disabled={!!busy}>{busy === k && <LoaderCircle size={16} className="spin" />}Lưu</button>
            <button className="button button-outline" type="button" onClick={() => void check(b, kind)} disabled={!!busy || !(draft[k] ?? "").trim()}>Kiểm tra</button>
          </div>
          {(notes[k] ?? []).map((line, i) => <p className="form-hint" role="status" key={i}>{line}</p>)}
        </div>; })}
      </div>)}
    </div>}
  </details>;
}
