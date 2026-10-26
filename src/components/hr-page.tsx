"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { birthdaysOf, countBy, staffOf, type HrBirthday, type HrPayload, type HrStaff } from "@/lib/hr";
import { ReachTable, type Col } from "@/components/reach-table";

const VIEWS = [["staff", "Danh sách nhân sự"], ["birthdays", "Sinh nhật"], ["recruit", "Tuyển dụng"]] as const;
type View = (typeof VIEWS)[number][0];
const NA = "—";
const dash = (s: string) => s || NA;
const left = (n: number | null) => (n === null ? NA : n === 0 ? "Hôm nay" : `${n} ngày`);

const staffCols: Col<HrStaff>[] = [
  { label: "Nhân sự", text: (s) => s.name, render: (s) => <>{s.name}<small>{s.id}</small></> },
  { label: "Bộ phận", text: (s) => dash(s.dept) }, { label: "Chức danh", text: (s) => dash(s.title) },
  { label: "Ngày vào", text: (s) => dash(s.start) }, { label: "Trạng thái", text: (s) => dash(s.status) }, { label: "Thâm niên (tháng)", text: (s) => dash(s.tenure) },
  { label: "Điện thoại", text: (s) => dash(s.phone) }, { label: "Email", text: (s) => dash(s.email) },
  { label: "Sinh nhật tới", text: (s) => dash(s.nextBday), sort: (s) => String(s.daysLeft ?? 9999).padStart(4, "0") },
];
const bdayCols: Col<HrBirthday>[] = [
  { label: "Họ tên", text: (b) => b.name, render: (b) => <>{b.name}<small>{b.id}</small></> },
  { label: "Bộ phận", text: (b) => dash(b.dept) }, { label: "Ngày sinh", text: (b) => dash(b.dob) },
  { label: "Sinh nhật tới", text: (b) => dash(b.next) }, { label: "Tuổi", text: (b) => dash(b.age) }, { label: "Còn", text: (b) => left(b.daysLeft), sort: (b) => String(b.daysLeft ?? 9999).padStart(4, "0") },
];

/** Staff, birthdays and recruitment of the HR Google Sheet, read through its Apps Script web app (/api/hr). Read only. */
export function HrPage() {
  const [data, setData] = useState<HrPayload | null>(null);
  const [message, setMessage] = useState("");
  const [view, setView] = useState<View>("staff");
  const [dept, setDept] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    fetch("/api/hr", { cache: "no-store" })
      .then(async (res) => ({ res, body: await res.json().catch(() => ({})) }))
      .then(({ res, body }) => { if (!active) return; if (res.ok) setData(body); else setMessage(body.message ?? `Lỗi ${res.status}`); })
      .catch(() => { if (active) setMessage("Không kết nối được máy chủ."); });
    return () => { active = false; };
  }, [version]);

  const staff = useMemo(() => staffOf(data?.staff ?? []), [data]);
  const depts = useMemo(() => countBy(staff, (s) => s.dept), [staff]);
  const shown = staff.filter((s) => !dept || (s.dept || "Chưa cập nhật") === dept);
  const bdays = useMemo(() => birthdaysOf(data?.bdays ?? []), [data]);
  const pipeline = useMemo(() => countBy(data?.cands ?? [], (r) => String(r[11] ?? "").trim()), [data]);
  const kpis = (data?.kpi ?? []).filter((k) => k.label);

  return (
    <section className="summary-report">
      <div className="summary-hero">
        <div>
          <h1>Nhân sự</h1>
          <p>Đọc trực tiếp từ file quản lý nhân sự trên Google Sheets qua Apps Script. Chỉ xem; thêm ứng viên, lịch phỏng vấn và đổi trạng thái làm ở web app Apps Script.</p>
        </div>
        <div className="summary-controls">
          <button type="button" disabled={!data && !message} onClick={() => { setData(null); setMessage(""); setVersion((v) => v + 1); }}><RefreshCw size={15} className={!data && !message ? "spin" : undefined} />Làm mới</button>
        </div>
      </div>
      {message && <div className="alert alert-error" role="alert"><span>{message}</span></div>}
      {!data && !message && <p className="summary-note">Đang lấy dữ liệu…</p>}
      {data && <>
        {kpis.length > 0 && <div className="range-presets reconcile-filter" role="group" aria-label="Chỉ số tổng quan">{kpis.map((k) => <span key={k.label} className="summary-note" style={{ margin: 0 }}><strong>{k.value}</strong> {k.label}</span>)}</div>}
        <div className="range-presets reconcile-filter" role="group" aria-label="Mục nhân sự">
          {VIEWS.map(([key, label]) => <button type="button" key={key} aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}
        </div>
        {view === "staff" && <>
          {depts.length > 1 && <div className="range-presets reconcile-filter" role="group" aria-label="Lọc theo bộ phận">
            <button type="button" aria-pressed={!dept} onClick={() => setDept("")}>Tất cả ({staff.length})</button>
            {depts.map(([name, n]) => <button type="button" key={name} aria-pressed={dept === name} onClick={() => setDept(name)}>{name} ({n})</button>)}
          </div>}
          {shown.length === 0 ? <p className="summary-note">Chưa có nhân sự.</p> : <ReachTable rows={shown} columns={staffCols} rowKey={(s) => s.id} />}
        </>}
        {view === "birthdays" && (bdays.length === 0 ? <p className="summary-note">Chưa có dữ liệu sinh nhật.</p> : <ReachTable rows={bdays} columns={bdayCols} rowKey={(b) => b.id} />)}
        {view === "recruit" && <>
          <h4>Ứng viên theo trạng thái ({data.cands.length})</h4>
          {pipeline.length === 0 ? <p className="summary-note">Chưa có ứng viên.</p> : <ReachTable rows={pipeline} columns={[{ label: "Trạng thái", text: (r) => r[0] }, { label: "Ứng viên", text: (r) => String(r[1]), value: (r) => r[1] as number, total: true }] as Col<[string, number]>[]} rowKey={(r) => r[0]} />}
          <h4>Nhu cầu tuyển dụng ({data.needs.length})</h4>
          {data.needs.length === 0 ? <p className="summary-note">Chưa có nhu cầu tuyển dụng.</p> : <ReachTable rows={data.needs.filter((r) => r[0])} columns={[
            { label: "Mã", text: (r: string[]) => r[0] }, { label: "Bộ phận", text: (r: string[]) => dash(r[2]) }, { label: "Vị trí", text: (r: string[]) => dash(r[3]) },
            { label: "Số lượng", text: (r: string[]) => dash(r[4]) }, { label: "Hạn tuyển", text: (r: string[]) => dash(r[5]) }, { label: "Người yêu cầu", text: (r: string[]) => dash(r[6]) }, { label: "Lương", text: (r: string[]) => dash(r[7]) }, { label: "Trạng thái", text: (r: string[]) => dash(r[10]) }, { label: "Ghi chú", text: (r: string[]) => dash(r[11]) },
          ]} rowKey={(r) => r[0]} />}
        </>}
      </>}
    </section>
  );
}
