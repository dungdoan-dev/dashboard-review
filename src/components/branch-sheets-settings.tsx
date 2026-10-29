"use client";

import { useCallback, useEffect, useState } from "react";
import { FileSpreadsheet, LoaderCircle } from "lucide-react";
import { SHEET_KINDS, type SheetKind } from "@/lib/ledger-sheets";
import { resetSheetUrls } from "@/components/use-sheet-url";

type Branch = { hotel: number; name: string; standalone?: boolean; hotelUrl: string | null; fnbUrl: string | null };
type State = { serviceEmail: string; month: string; branches: Branch[] };
type Check = { name: string; ledger: string[]; stock: string[]; messages: string[] };

const key = (hotel: number, kind: SheetKind) => `${hotel}:${kind}`;
const urlOf = (b: Branch, kind: SheetKind) => (kind === "fnb" ? b.fnbUrl : b.hotelUrl) ?? "";

async function call(method: "GET" | "PUT" | "POST", body?: object, month = "") {
  const res = await fetch(`/api/bluejay/branch-sheets${method === "GET" ? `?month=${month}` : ""}`, { method, cache: "no-store", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) }).catch(() => null);
  if (!res) return { ok: false as const, body: { message: "Không kết nối được máy chủ." } };
  return { ok: res.ok, body: await res.json().catch(() => ({})) };
}

/** Cài đặt → Link Google Sheet: the links of a month (8: two per branch, hotel and Ăn sáng, cafe, mini mart), saved in the database per month and checked against the month's tabs. */
export function BranchSheetsSettings() {
  const [data, setData] = useState<State | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [shownMonth, setShownMonth] = useState(""); // the month the links on screen belong to

  const apply = useCallback((r: Awaited<ReturnType<typeof call>>) => {
    if (!r.ok) { setMessage(r.body.message ?? "Không tải được link."); return; }
    const state = r.body as State;
    setData(state); setShownMonth(state.month);
    setDraft(Object.fromEntries(state.branches.flatMap((b) => SHEET_KINDS.map(({ kind }) => [key(b.hotel, kind), urlOf(b, kind)]))));
  }, []);
  const load = useCallback(async () => apply(await call("GET", undefined, month)), [apply, month]);
  useEffect(() => {
    let active = true;
    void call("GET", undefined, month).then((r) => { if (active) apply(r); });
    return () => { active = false; };
  }, [apply, month]);

  async function save(b: Branch, kind: SheetKind) {
    const k = key(b.hotel, kind); setBusy(k); setNotes((n) => ({ ...n, [k]: [] }));
    const r = await call("PUT", { hotel: b.hotel, kind, month, link: draft[k] ?? "" });
    setNotes((n) => ({ ...n, [k]: [r.ok ? ((draft[k] ?? "").trim() ? `Đã lưu link của tháng ${month.slice(5)}/${month.slice(0, 4)}.` : "Đã xóa link.") : r.body.message ?? "Không lưu được."] }));
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
    <summary className="automatic-sync-heading"><div className="section-kicker"><FileSpreadsheet size={14} /> CÀI ĐẶT · VẬN HÀNH</div><h2 id="branch-sheets-title">Link Google Sheet</h2><p>Mỗi tháng có 9 link: mỗi khách sạn 2 link, đơn vị không có khách sạn (VTDC HCM) 1 link. Hai loại link: Khách sạn (thu chi và kho) và Ăn sáng, cafe, mini mart (thu chi và kho). Chọn tháng, dán link, bấm Lưu: link được lưu riêng cho tháng đó. Bấm Kiểm tra để xem sheet có đủ tab của tháng.</p></summary>
    {!data ? <p>{message || "Đang tải link…"}</p> : <div className="sheet-links">
      <div className="sheet-links-bar">
        <p className="form-hint">Chia sẻ mỗi sheet (chỉ xem) cho <strong>{data.serviceEmail || "tài khoản đọc Google Sheet (chưa cấu hình)"}</strong> trước khi kiểm tra.</p>
        <label className="field sheet-month"><span>Tháng</span><input type="month" value={month} onChange={(event) => { if (event.target.value) { setMonth(event.target.value); setNotes({}); } }} /></label>
      </div>
      <div className="sheet-branches" aria-busy={shownMonth !== month}>
        {data.branches.map((b) => <section className="sheet-branch" key={b.hotel} aria-label={b.name}>
          <h3>{b.name}</h3>
          {SHEET_KINDS.filter(({ kind }) => !b.standalone || kind === "fnb").map(({ kind, label }) => { const k = key(b.hotel, kind); return <div className="sheet-row" key={kind}>
            <label className="field"><span>{label}</span><input type="url" placeholder="https://docs.google.com/spreadsheets/d/…" value={draft[k] ?? ""} onChange={(event) => setDraft((d) => ({ ...d, [k]: event.target.value }))} /></label>
            <div className="sheet-actions">
              <button className="button button-primary" type="button" onClick={() => void save(b, kind)} disabled={!!busy}>{busy === k && <LoaderCircle size={16} className="spin" />}Lưu</button>
              <button className="button button-outline" type="button" onClick={() => void check(b, kind)} disabled={!!busy || !(draft[k] ?? "").trim()}>Kiểm tra</button>
            </div>
            {(notes[k] ?? []).map((line, i) => <p className="sheet-note" role="status" key={i}>{line}</p>)}
          </div>; })}
        </section>)}
      </div>
    </div>}
  </details>;
}
