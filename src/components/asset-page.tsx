"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { ReachTable, type Col } from "@/components/reach-table";
import { ConfirmDialog, RecordDialog } from "@/components/hr-form";
import { AssetOverview } from "@/components/asset-overview";
import { ASSET_TABS, ASSET_TAB_KEYS, assetFormValues, assetOptions, assetUnits, colIndex, filterByUnit, nextAssetId, type AssetField, type AssetPayload, type AssetTab } from "@/lib/asset-forms";

type Row = { row: number; cells: string[] };
type Dialog = { tab: AssetTab; row?: number; key?: string; initial: Record<string, string> };
type Removal = { tab: AssetTab; row: number; key: string; label: string };

const UNSET = "Chưa cập nhật";

/** Tài sản: the asset Google Sheet read and edited through its Apps Script web app (/api/assets). */
export function AssetPage() {
  const [data, setData] = useState<AssetPayload | null>(null);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<AssetTab | "overview">("overview");
  const tab: AssetTab = view === "overview" ? "ts" : view;
  const [unit, setUnit] = useState(""); // kept across tabs; "" = every unit
  const [query, setQuery] = useState("");
  const [pick, setPick] = useState("");
  const [version, setVersion] = useState(0);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [removal, setRemoval] = useState<Removal | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/assets", { cache: "no-store" })
      .then(async (res) => ({ res, body: await res.json().catch(() => ({})) }))
      .then(({ res, body }) => { if (!active) return; if (res.ok) { setData(body); setMessage(""); } else setMessage(body.message ?? `Lỗi ${res.status}`); })
      .catch(() => { if (active) setMessage("Không kết nối được máy chủ."); });
    return () => { active = false; };
  }, [version]);

  const loading = !data && !message;
  const refresh = () => { setData(null); setMessage(""); setNotice(""); setVersion((v) => v + 1); };
  const shown = useMemo(() => (data && unit ? filterByUnit(data, unit) : data), [data, unit]); // the forms still choose from every unit's rows
  const units = data ? assetUnits(data) : [];
  const conf = ASSET_TABS[tab], sheet = view === "overview" ? undefined : shown?.tabs[tab];

  /** One write to the sheet; returns an error message or null, and reloads after a success. */
  const send = useCallback(async (body: Record<string, unknown>, done: string) => {
    const res = await fetch("/api/assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const out = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) return (out.message as string | undefined) ?? "Không kết nối được máy chủ.";
    setNotice(done); setVersion((v) => v + 1);
    return null;
  }, []);

  const columns = useMemo((): Col<Row>[] => {
    if (!sheet) return [];
    const shown = conf.cols ? conf.cols.map(colIndex) : sheet.headers.map((_, i) => i);
    // the edit and delete buttons stay last and pinned to the right edge (.asset-table), so a wide table never hides them
    return [...shown.filter((i) => i < sheet.headers.length).map((i): Col<Row> => ({ label: sheet.headers[i].replace(/ \*$/, ""), text: (r) => r.cells[i] || "—" })), { label: "Thao tác", text: () => "", render: (r) => <span className="hr-actions">
        <button type="button" className="hr-act" onClick={() => setDialog({ tab, row: r.row, key: r.cells[0], initial: assetFormValues(tab, r.cells) })} aria-label={`Sửa ${r.cells[0]}`} title="Sửa"><Pencil size={14} /></button>
        <button type="button" className="hr-act danger" onClick={() => setRemoval({ tab, row: r.row, key: r.cells[0], label: `${r.cells[0]}${r.cells[1] ? ` — ${r.cells[1]}` : ""}` })} aria-label={`Xóa ${r.cells[0]}`} title="Xóa"><Trash2 size={14} /></button>
      </span> }];
  }, [sheet, conf, tab]);

  const filterAt = conf.filter ? colIndex(conf.filter) : -1;
  const counts = useMemo(() => filterAt < 0 || !sheet ? [] : [...sheet.rows.reduce((m, r) => { const v = r.cells[filterAt] || UNSET; return m.set(v, (m.get(v) ?? 0) + 1); }, new Map<string, number>())].sort((a, b) => b[1] - a[1]), [sheet, filterAt]);
  const needle = query.trim().toLowerCase();
  const rows = (sheet?.rows ?? []).filter((r) => (!pick || (r.cells[filterAt] || UNSET) === pick) && (!needle || r.cells.some((c) => c.toLowerCase().includes(needle))));
  const choose = (next: AssetTab | "overview") => { setView(next); setPick(""); setQuery(""); };
  const add = () => setDialog({ tab, initial: conf.nextId && sheet ? { A: nextAssetId(sheet.rows.map((r) => r.cells[0])) } : {} });

  return (
    <section className="summary-report">
      <div className="hr-toolbar">
        <div className="range-presets reconcile-filter" role="group" aria-label="Mục tài sản">
          <button type="button" aria-pressed={view === "overview"} onClick={() => choose("overview")}>Tổng quan</button>
          {ASSET_TAB_KEYS.map((key) => <button type="button" key={key} aria-pressed={view === key} onClick={() => choose(key)}>{ASSET_TABS[key].title}</button>)}
        </div>
        <button type="button" className="button button-outline" disabled={loading} onClick={refresh}><RefreshCw size={15} className={loading ? "spin" : undefined} />Làm mới</button>
      </div>
      {units.length > 1 && <div className="hr-toolbar"><div className="range-presets reconcile-filter" role="group" aria-label="Lọc theo đơn vị">
        <span className="filter-label" aria-hidden="true">Đơn vị</span>
        <button type="button" aria-pressed={!unit} onClick={() => { setUnit(""); setPick(""); }}>Tất cả đơn vị</button>
        {units.map(([code, name]) => <button type="button" key={code} aria-pressed={unit === code} onClick={() => { setUnit(code); setPick(""); }} title={code}>{name || code}</button>)}
      </div></div>}
      {message && <div className="alert alert-error" role="alert"><span>{message}</span></div>}
      {notice && <p className="summary-note" role="status">{notice}</p>}
      {loading && <p className="summary-note" role="status">Đang lấy dữ liệu…</p>}
      {view === "overview" && shown && <AssetOverview data={shown} />}
      {sheet && <div className="summary-chart wide">
        <div className="hr-card-head">
          <h4>{conf.title}<small>{rows.length === sheet.rows.length ? `${rows.length} dòng` : `${rows.length} / ${sheet.rows.length} dòng`}</small></h4>
          <button type="button" className="button button-primary" onClick={add}><Plus size={15} />Thêm {conf.item}</button>
        </div>
        <div className="asset-filters"><label className="search-box"><Search size={15} aria-hidden="true" /><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Tìm trong ${conf.title.toLowerCase()}`} aria-label={`Tìm trong ${conf.title}`} /></label>
        {counts.length > 1 && <div className="range-presets reconcile-filter" role="group" aria-label={`Lọc theo ${sheet.headers[filterAt]}`}>
          <span className="filter-label" aria-hidden="true">{sheet.headers[filterAt].replace(/ \*$/, "")}</span>
          <button type="button" aria-pressed={!pick} onClick={() => setPick("")}>Tất cả ({sheet.rows.length})</button>
          {counts.map(([name, n]) => <button type="button" key={name} aria-pressed={pick === name} onClick={() => setPick(name)}>{name} ({n})</button>)}
        </div>}</div>
        {rows.length ? <div className="asset-table"><ReachTable rows={rows} columns={columns} rowKey={(r) => String(r.row)} /></div> : <p className="summary-note">{sheet.rows.length ? "Không có dòng nào khớp." : `Chưa có ${conf.item}.`}</p>}
      </div>}
      {dialog && data && <RecordDialog form={{ title: ASSET_TABS[dialog.tab].item, fields: ASSET_TABS[dialog.tab].fields }} kicker="TÀI SẢN" id={dialog.key} initial={dialog.initial}
        optionsOf={(def: AssetField) => (def.options ? assetOptions(data, def.options) : [])} onClose={() => setDialog(null)}
        onSubmit={(values) => send({ tab: dialog.tab, action: "save", row: dialog.row, key: dialog.key, values }, dialog.key ? `Đã cập nhật ${dialog.key}.` : "Đã thêm vào Google Sheet.")} />}
      {removal && <ConfirmDialog label={removal.label} onClose={() => setRemoval(null)} onConfirm={() => send({ tab: removal.tab, action: "delete", row: removal.row, key: removal.key }, `Đã xóa ${removal.key}.`)} />}
    </section>
  );
}
