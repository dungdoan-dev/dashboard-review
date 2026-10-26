"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { birthdaysOf, candsOf, intvsOf, needsOf, staffOf, type HrCand, type HrIntv, type HrNeed, type HrPayload, type HrStaff } from "@/lib/hr";
import { formValues, type FieldDef, type HrEntity } from "@/lib/hr-forms";
import { HrOverview } from "@/components/hr-overview";
import { ConfirmDialog, RecordDialog, type Option } from "@/components/hr-form";
import { BirthdayTable, CandTable, IntvTable, NeedsTable, StaffTable, type Crud } from "@/components/hr-tables";

const TABS = [["overview", "Tổng quan"], ["needs", "Nhu cầu tuyển dụng"], ["cands", "Ứng viên"], ["intvs", "Phỏng vấn"], ["staff", "Nhân sự"], ["bdays", "Sinh nhật"]] as const;
type Tab = (typeof TABS)[number][0];
type Dialog = { entity: HrEntity; id?: string; initial: Record<string, string> };
type Removal = { entity: HrEntity; id: string; label: string };

/** Nhân sự: the HR Google Sheet read and edited through its Apps Script web app (/api/hr). */
export function HrPage() {
  const [data, setData] = useState<HrPayload | null>(null);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [version, setVersion] = useState(0);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [removal, setRemoval] = useState<Removal | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/hr", { cache: "no-store" })
      .then(async (res) => ({ res, body: await res.json().catch(() => ({})) }))
      .then(({ res, body }) => { if (!active) return; if (res.ok) { setData(body); setMessage(""); } else setMessage(body.message ?? `Lỗi ${res.status}`); })
      .catch(() => { if (active) setMessage("Không kết nối được máy chủ."); });
    return () => { active = false; };
  }, [version]);

  const rows = useMemo(() => data && ({ staff: staffOf(data.staff), needs: needsOf(data.needs), cands: candsOf(data.cands), intvs: intvsOf(data.intvs), bdays: birthdaysOf(data.bdays) }), [data]);
  const loading = !data && !message;
  const refresh = () => { setData(null); setMessage(""); setNotice(""); setVersion((v) => v + 1); };

  /** One write to the sheet; returns an error message or null, and reloads the lists after a success. */
  const send = useCallback(async (body: Record<string, unknown>, done: string) => {
    const res = await fetch("/api/hr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const out = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) return (out.message as string | undefined) ?? "Không kết nối được máy chủ.";
    setNotice(done); setVersion((v) => v + 1);
    return null;
  }, []);

  const optionsOf = (def: FieldDef): Option[] => {
    if (def.options === "needIds") return (rows?.needs ?? []).map((n) => [n.id, `${n.id} — ${n.dept} ${n.title}`]);
    if (def.options === "candIds") return (rows?.cands ?? []).map((c) => [c.id, `${c.id} — ${c.name}`]);
    return (def.options ? data?.opt?.[def.options] ?? [] : []).map((v) => [v, v]);
  };
  const crud = <R extends { id: string }>(entity: HrEntity, label: (row: R) => string): Crud<R> => ({
    onAdd: () => setDialog({ entity, initial: {} }),
    onEdit: (row) => setDialog({ entity, id: row.id, initial: formValues(entity, row as unknown as Record<string, unknown>) }),
    onDelete: (row) => setRemoval({ entity, id: row.id, label: `${row.id} — ${label(row)}` }),
  });
  const needsCrud = useMemo(() => crud<HrNeed>("need", (n) => `${n.dept} ${n.title}`), []);
  const candsCrud = useMemo(() => crud<HrCand>("cand", (c) => c.name), []);
  const intvsCrud = useMemo(() => crud<HrIntv>("intv", (i) => i.name), []);
  const staffCrud = useMemo(() => crud<HrStaff>("staff", (s) => s.name), []);

  return (
    <section className="summary-report">
      <div className="hr-toolbar">
        <div className="range-presets reconcile-filter" role="group" aria-label="Mục nhân sự">
          {TABS.map(([key, label]) => <button type="button" key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}
          <button type="button" disabled={loading} onClick={refresh}><RefreshCw size={15} className={loading ? "spin" : undefined} />Làm mới</button>
        </div>
      </div>
      {message && <div className="alert alert-error" role="alert"><span>{message}</span></div>}
      {notice && <p className="summary-note" role="status">{notice}</p>}
      {loading && <p className="summary-note" role="status">Đang lấy dữ liệu…</p>}
      {data && rows && <>
        {tab === "overview" && <HrOverview data={data} {...rows} />}
        {tab === "needs" && <NeedsTable rows={rows.needs} crud={needsCrud} />}
        {tab === "cands" && <CandTable rows={rows.cands} crud={candsCrud} />}
        {tab === "intvs" && <IntvTable rows={rows.intvs} crud={intvsCrud} />}
        {tab === "staff" && <StaffTable rows={rows.staff} crud={staffCrud} />}
        {tab === "bdays" && <BirthdayTable rows={rows.bdays} />}
      </>}
      {dialog && <RecordDialog entity={dialog.entity} id={dialog.id} initial={dialog.initial} optionsOf={optionsOf} onClose={() => setDialog(null)}
        onSubmit={(fields) => send({ entity: dialog.entity, action: "save", id: dialog.id, fields }, dialog.id ? `Đã cập nhật ${dialog.id}.` : "Đã thêm vào Google Sheet.")} />}
      {removal && <ConfirmDialog label={removal.label} onClose={() => setRemoval(null)} onConfirm={() => send({ entity: removal.entity, action: "delete", id: removal.id }, `Đã xóa ${removal.id}.`)} />}
    </section>
  );
}
