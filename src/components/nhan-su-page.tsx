"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RefreshCw } from "lucide-react";
import { fmtDate } from "@/lib/format-date";
import { todayVN } from "@/lib/bluejay-metrics";
import { isLeft, summarizeStaff, type HrStaffRow } from "@/lib/hr-staff";
import { AXIS, Donut, PALETTE, TOOLTIP } from "@/components/dashboard-charts";
import { Columns } from "@/components/hr-overview";
import { NhanSuProfile, staffKey } from "@/components/nhan-su-profile";
import { ReachTable, type Col } from "@/components/reach-table";

type Sync = { unit: string; file_name: string; staff_count: number; error: string | null; synced_at: string };
type Loaded = { staff: HrStaffRow[]; sync: Sync[]; message: string };

const statusTone = (s: HrStaffRow) => (isLeft(s) ? "red" : "green");
const date = (d: string | null) => (d ? fmtDate(d) : "—");
const listCols = (open: (s: HrStaffRow) => void): Col<HrStaffRow>[] => [
  { label: "Họ và tên", text: (s) => s.name, render: (s) => <button type="button" className="hr-link" onClick={() => open(s)}>{s.name || s.staff_id}</button> },
  { label: "Mã NV", text: (s) => s.staff_id }, { label: "Đơn vị", text: (s) => s.unit }, { label: "Phòng ban", text: (s) => s.department || "—" },
  { label: "Vị trí", text: (s) => s.position || "—" }, { label: "Cấp bậc", text: (s) => s.level || "—" }, { label: "Loại công việc", text: (s) => s.job_type || "—" },
  { label: "Giới tính", text: (s) => s.gender || "—" }, { label: "Ngày sinh", text: (s) => date(s.birth_date), sort: (s) => s.birth_date ?? "" },
  { label: "Ngày vào", text: (s) => date(s.start_date), sort: (s) => s.start_date ?? "" }, { label: "Học vấn", text: (s) => s.education || "—" },
  { label: "Điện thoại", text: (s) => s.phone || "—" }, { label: "Email công việc", text: (s) => s.work_email || "—" }, { label: "Tỉnh/TP", text: (s) => s.province || "—" },
  { label: "Loại hợp đồng", text: (s) => s.contract_type || "—" }, { label: "Hết hạn HĐ", text: (s) => date(s.contract_end), sort: (s) => s.contract_end ?? "" },
  { label: "Trạng thái", text: (s) => s.status || "—", render: (s) => <span className={`hr-badge ${statusTone(s)}`}>{s.status || "—"}</span> },
  { label: "Ngày nghỉ việc", text: (s) => date(s.end_date), sort: (s) => s.end_date ?? "" },
];

const TABS = [["overview", "Tổng quan"], ["list", "Danh sách nhân viên"], ["profile", "Hồ sơ NV"]] as const;
type Tab = (typeof TABS)[number][0];

function Due({ title, rows, empty }: { title: string; rows: { s: HrStaffRow; date: string; days: number }[]; empty: string }) {
  return <div className="summary-chart"><h4>{title}</h4>{rows.length
    ? <ul className="hr-list">{rows.map(({ s, date, days }) => <li key={`${s.unit}-${s.staff_id}`}><span><strong>{s.name}</strong><small>{s.unit} · {s.department || "—"} · {fmtDate(date)}</small></span><span className="hr-badge orange">{days === 0 ? "Hôm nay" : `${days} ngày`}</span></li>)}</ul>
    : <p className="summary-note">{empty}</p>}</div>;
}

/** Nhân sự: the staff of the HR Google Sheets, copied into the database every day at 08:00 (/api/nhan-su). */
export function NhanSuPage() {
  const [data, setData] = useState<Loaded | null>(null);
  const [unit, setUnit] = useState(""); // "" = all units
  const [tab, setTab] = useState<Tab>("overview");
  const [pick, setPick] = useState(""); // "unit|staff id" shown on the Hồ sơ NV tab
  const [version, setVersion] = useState(0); // bumped after a sync to read the stored staff again
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/nhan-su", { cache: "no-store" })
      .then(async (res) => ({ res, body: await res.json().catch(() => ({})) }))
      .then(({ res, body }) => { if (active) setData({ staff: res.ok ? body.staff ?? [] : [], sync: res.ok ? body.sync ?? [] : [], message: res.ok ? "" : body.message ?? `Lỗi ${res.status}` }); })
      .catch(() => { if (active) setData({ staff: [], sync: [], message: "Không kết nối được máy chủ." }); });
    return () => { active = false; };
  }, [version]);

  async function sync() {
    setBusy(true); setNotice("");
    const res = await fetch("/api/nhan-su", { method: "POST" }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res || !res.ok) { setNotice(body.message ?? "Không kết nối được máy chủ."); return; }
    const failed = Object.entries(body as Record<string, number | { error: string }>).filter(([, v]) => typeof v === "object");
    setNotice(failed.length ? `Có ${failed.length} file lỗi: ${failed.map(([k, v]) => `${k} (${(v as { error: string }).error})`).join("; ")}` : `Đã lấy ${Object.keys(body).length} file.`);
    setVersion((v) => v + 1);
  }

  const staff = useMemo(() => (data?.staff ?? []).filter((s) => !unit || s.unit === unit), [data, unit]);
  const today = todayVN();
  const sum = useMemo(() => summarizeStaff(staff, today), [staff, today]);
  const openProfile = (s: HrStaffRow) => { setPick(staffKey(s)); setTab("profile"); };
  const columns = useMemo(() => listCols(openProfile), []);
  const units = [...new Set((data?.staff ?? []).map((s) => s.unit))];
  const latest = (data?.sync ?? []).reduce((m, s) => (s.synced_at > m ? s.synced_at : m), "");
  const errors = (data?.sync ?? []).filter((s) => s.error);
  const kpis: [string, string][] = [["Đang làm", String(sum.active)], ["Đã nghỉ", String(sum.left)], ["Tuổi trung bình", sum.avgAge === null ? "—" : sum.avgAge.toLocaleString("vi-VN", { maximumFractionDigits: 1 })], ["Nữ", String(sum.female)], ["Nam", String(sum.male)]];

  return (
    <section className="summary-report">
      <div className="hr-toolbar">
        <div className="range-presets reconcile-filter" role="group" aria-label="Mục nhân sự">
          {TABS.map(([key, label]) => <button type="button" key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}
        </div>
        <div className="range-presets reconcile-filter" role="group" aria-label="Lọc theo đơn vị">
          <button type="button" aria-pressed={!unit} onClick={() => setUnit("")}>Tất cả ({units.length})</button>
          {units.map((u) => <button type="button" key={u} aria-pressed={unit === u} onClick={() => setUnit(u)}>{u}</button>)}
          <button type="button" disabled={busy} onClick={() => void sync()}><RefreshCw size={15} className={busy ? "spin" : undefined} />{busy ? "Đang lấy…" : "Cập nhật số liệu"}</button>
        </div>
      </div>
      {notice && <p className="summary-note" role="status">{notice}</p>}
      {data?.message && <div className="alert alert-error" role="alert"><span>{data.message}</span></div>}
      {errors.map((e) => <div key={e.unit} className="alert alert-error" role="alert"><span>{e.unit}: {e.error} (đang hiện dữ liệu lấy lần trước)</span></div>)}
      {!data && <p className="summary-note" role="status">Đang lấy dữ liệu…</p>}
      {data && !data.message && (data.staff.length === 0
        ? <p className="summary-note">Chưa có dữ liệu. Bấm “Cập nhật số liệu” để lấy từ các Google Sheet nhân sự.</p>
        : <>
          <p className="summary-note">Lấy từ Google Sheet nhân sự, tự cập nhật mỗi ngày lúc 08:00{latest ? `; lần gần nhất ${new Date(latest).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}` : ""}. Chỉ lưu thông tin công việc, không lưu CCCD, số điện thoại, lương hay tài khoản.</p>
          {tab === "overview" && <>
          <div className="summary-kpis" aria-label="Chỉ số nhân sự">{kpis.map(([label, value]) => <div key={label} className="summary-kpi"><span>{label}</span><strong>{value}</strong></div>)}</div>
          <div className="summary-grid">
            <div className="summary-chart"><h4>Nhân sự đang làm theo đơn vị</h4><Columns rows={sum.byUnit} unit="người" /></div>
            <div className="summary-chart"><h4>Cơ cấu theo phòng ban</h4><Donut slices={sum.byDepartment.map(([name, value], i) => ({ name, value, color: PALETTE[i % PALETTE.length] }))} unit="người" width="100%" animate={false} /></div>
            <div className="summary-chart"><h4>Độ tuổi</h4><Columns rows={sum.ageRanges} unit="người" /></div>
            <div className="summary-chart"><h4>Vào và nghỉ việc 12 tháng gần nhất</h4>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={sum.monthly.map((m) => ({ name: `${m.month.slice(5)}/${m.month.slice(2, 4)}`, "Vào làm": m.joined, "Nghỉ việc": m.left }))} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#edf1f6" vertical={false} />
                  <XAxis dataKey="name" tick={AXIS} tickLine={false} />
                  <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={36} />
                  <Tooltip {...TOOLTIP} cursor={{ fill: "#f4f6f9" }} />
                  <Legend />
                  <Bar dataKey="Vào làm" fill={PALETTE[2]} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                  <Bar dataKey="Nghỉ việc" fill="#dc2626" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="summary-grid">
            <Due title="Sinh nhật trong 30 ngày tới" rows={sum.birthdays} empty="Không có sinh nhật trong 30 ngày tới." />
            <Due title="Hợp đồng hết hạn trong 60 ngày" rows={sum.contractsDue} empty="Không có hợp đồng sắp hết hạn." />
            <Due title="Kết thúc thử việc trong 30 ngày" rows={sum.probationsDue} empty="Không có ai sắp hết thử việc." />
          </div>
          </>}
          {tab === "list" && <details className="summary-chart wide revenue-fold" open><summary><h4>Danh sách nhân viên ({staff.length})</h4></summary><ReachTable rows={staff} columns={columns} rowKey={staffKey} /></details>}
          {tab === "profile" && <NhanSuProfile staff={staff} picked={pick} onPick={setPick} today={today} />}
        </>)}
    </section>
  );
}
