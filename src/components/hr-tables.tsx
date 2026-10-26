"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { ReachTable, type Col } from "@/components/reach-table";
import { statusTone, type HrBirthday, type HrCand, type HrIntv, type HrNeed, type HrStaff } from "@/lib/hr";

const dash = (s: string) => s || "—";
const Badge = ({ text }: { text: string }) => <span className={`hr-badge ${statusTone(text)}`}>{dash(text)}</span>;
const Person = ({ name, sub }: { name: string; sub: string }) => <>{name}<small>{sub}</small></>;
const left = (n: number | null) => (n === null ? "—" : n === 0 ? "Hôm nay" : `${n} ngày`);
const byLeft = (n: number | null) => String(n ?? 9999).padStart(4, "0");

export type Crud<R> = { onAdd: () => void; onEdit: (row: R) => void; onDelete: (row: R) => void };
type Row = { id: string };

/** The last column of an editable table: edit and delete buttons for the row. */
function withActions<R extends Row>(cols: Col<R>[], crud: Crud<R>): Col<R>[] {
  return [...cols, { label: "Thao tác", text: () => "", render: (row) => <span className="hr-actions">
    <button type="button" className="hr-act" onClick={() => crud.onEdit(row)} aria-label={`Sửa ${row.id}`} title="Sửa"><Pencil size={14} /></button>
    <button type="button" className="hr-act danger" onClick={() => crud.onDelete(row)} aria-label={`Xóa ${row.id}`} title="Xóa"><Trash2 size={14} /></button>
  </span> }];
}

const needCols: Col<HrNeed>[] = [
  { label: "Mã", text: (n) => n.id }, { label: "Ngày", text: (n) => dash(n.date) }, { label: "Bộ phận", text: (n) => dash(n.dept) }, { label: "Vị trí", text: (n) => dash(n.title) },
  { label: "Số lượng", text: (n) => String(n.qty), value: (n) => n.qty, total: true }, { label: "Hạn tuyển", text: (n) => dash(n.due) }, { label: "Người yêu cầu", text: (n) => dash(n.by) },
  { label: "Lương", text: (n) => dash(n.salary) }, { label: "Trạng thái", text: (n) => n.status, render: (n) => <Badge text={n.status} /> }, { label: "Ghi chú", text: (n) => dash(n.note) },
];
const candCols: Col<HrCand>[] = [
  { label: "Ứng viên", text: (c) => c.name, render: (c) => <Person name={c.name} sub={`${c.id}${c.email ? ` · ${c.email}` : ""}`} /> },
  { label: "Bộ phận", text: (c) => dash(c.dept) }, { label: "Vị trí", text: (c) => dash(c.title) }, { label: "Điện thoại", text: (c) => dash(c.phone) }, { label: "Nguồn", text: (c) => dash(c.source) },
  { label: "Trạng thái", text: (c) => c.status, render: (c) => <Badge text={c.status} /> }, { label: "Phụ trách", text: (c) => dash(c.owner) },
  { label: "CV", text: (c) => (c.cv ? "Có" : "—"), render: (c) => (c.cv ? <a className="hr-cv" href={c.cv} target="_blank" rel="noopener noreferrer">Mở CV</a> : <>—</>) },
];
const intvCols: Col<HrIntv>[] = [
  { label: "Ứng viên", text: (i) => i.name, render: (i) => <Person name={i.name} sub={`${i.id} · ${i.candId}`} /> }, { label: "Vị trí", text: (i) => dash(i.title) }, { label: "Vòng", text: (i) => dash(i.round) },
  { label: "Ngày", text: (i) => dash(i.date) }, { label: "Giờ", text: (i) => dash(i.time) }, { label: "Hình thức", text: (i) => dash(i.mode) }, { label: "Người phỏng vấn", text: (i) => dash(i.interviewer) },
  { label: "Kết quả", text: (i) => i.result, render: (i) => <Badge text={i.result} /> },
];
const staffCols: Col<HrStaff>[] = [
  { label: "Nhân sự", text: (s) => s.name, render: (s) => <Person name={s.name} sub={`${s.id}${s.email ? ` · ${s.email}` : ""}`} /> }, { label: "Bộ phận", text: (s) => dash(s.dept) }, { label: "Chức danh", text: (s) => dash(s.title) },
  { label: "Ngày vào", text: (s) => dash(s.start) }, { label: "Trạng thái", text: (s) => s.status, render: (s) => <Badge text={s.status} /> }, { label: "Thâm niên (tháng)", text: (s) => dash(s.tenure) },
  { label: "Điện thoại", text: (s) => dash(s.phone) }, { label: "Sinh nhật tới", text: (s) => dash(s.nextBday), sort: (s) => byLeft(s.daysLeft) },
];
const bdayCols: Col<HrBirthday>[] = [
  { label: "Họ tên", text: (b) => b.name, render: (b) => <Person name={b.name} sub={b.id} /> }, { label: "Bộ phận", text: (b) => dash(b.dept) }, { label: "Ngày sinh", text: (b) => dash(b.dob) },
  { label: "Sinh nhật tới", text: (b) => dash(b.next) }, { label: "Tuổi", text: (b) => dash(b.age) }, { label: "Còn", text: (b) => left(b.daysLeft), sort: (b) => byLeft(b.daysLeft) },
];

function Card({ title, count, add, addLabel, filters, children }: { title: string; count: string; add?: () => void; addLabel?: string; filters?: ReactNode; children: ReactNode }) {
  return <div className="summary-chart wide">
    <div className="hr-card-head"><h4>{title}<small>{count}</small></h4>{add && <button type="button" className="button button-primary" onClick={add}><Plus size={15} />{addLabel}</button>}</div>
    {filters}{children}
  </div>;
}
const Empty = ({ text }: { text: string }) => <p className="summary-note">{text}</p>;

function Pills({ label, all, items, value, onChange }: { label: string; all: number; items: [string, number][]; value: string; onChange: (v: string) => void }) {
  if (items.length < 2) return null;
  return <div className="range-presets reconcile-filter" role="group" aria-label={label}>
    <button type="button" aria-pressed={!value} onClick={() => onChange("")}>Tất cả ({all})</button>
    {items.map(([name, n]) => <button type="button" key={name} aria-pressed={value === name} onClick={() => onChange(name)}>{name} ({n})</button>)}
  </div>;
}
const tally = (items: string[]): [string, number][] => [...items.reduce((m, v) => m.set(v || "Chưa cập nhật", (m.get(v || "Chưa cập nhật") ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);

export function NeedsTable({ rows, crud }: { rows: HrNeed[]; crud: Crud<HrNeed> }) {
  const cols = useMemo(() => withActions(needCols, crud), [crud]);
  return <Card title="Nhu cầu tuyển dụng" count={`${rows.length} nhu cầu`} add={crud.onAdd} addLabel="Thêm nhu cầu">{rows.length ? <ReachTable rows={rows} columns={cols} rowKey={(n) => n.id} /> : <Empty text="Chưa có nhu cầu tuyển dụng." />}</Card>;
}
export function IntvTable({ rows, crud }: { rows: HrIntv[]; crud: Crud<HrIntv> }) {
  const cols = useMemo(() => withActions(intvCols, crud), [crud]);
  return <Card title="Lịch phỏng vấn" count={`${rows.length} lịch`} add={crud.onAdd} addLabel="Tạo lịch phỏng vấn">{rows.length ? <ReachTable rows={rows} columns={cols} rowKey={(i) => i.id} /> : <Empty text="Chưa có lịch phỏng vấn." />}</Card>;
}
export const BirthdayTable = ({ rows }: { rows: HrBirthday[] }) => <Card title="Sinh nhật nhân sự" count={`${rows.length} người`}>{rows.length ? <ReachTable rows={rows} columns={bdayCols} rowKey={(b) => b.id} /> : <Empty text="Chưa có dữ liệu sinh nhật." />}</Card>;

export function StaffTable({ rows, crud }: { rows: HrStaff[]; crud: Crud<HrStaff> }) {
  const [dept, setDept] = useState("");
  const cols = useMemo(() => withActions(staffCols, crud), [crud]);
  const shown = rows.filter((s) => !dept || (s.dept || "Chưa cập nhật") === dept);
  return <Card title="Danh sách nhân sự" count={`${shown.length} nhân sự`} add={crud.onAdd} addLabel="Thêm nhân sự" filters={<Pills label="Lọc theo bộ phận" all={rows.length} items={tally(rows.map((s) => s.dept))} value={dept} onChange={setDept} />}>
    {shown.length ? <ReachTable rows={shown} columns={cols} rowKey={(s) => s.id} /> : <Empty text="Chưa có nhân sự." />}
  </Card>;
}

export function CandTable({ rows, crud }: { rows: HrCand[]; crud: Crud<HrCand> }) {
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const cols = useMemo(() => withActions(candCols, crud), [crud]);
  const shown = rows.filter((c) => (!status || (c.status || "Chưa cập nhật") === status) && (!source || (c.source || "Chưa cập nhật") === source));
  return <Card title="Danh sách ứng viên" count={`${shown.length} ứng viên`} add={crud.onAdd} addLabel="Thêm ứng viên" filters={<>
    <Pills label="Lọc theo trạng thái" all={rows.length} items={tally(rows.map((c) => c.status))} value={status} onChange={setStatus} />
    <Pills label="Lọc theo nguồn" all={rows.length} items={tally(rows.map((c) => c.source))} value={source} onChange={setSource} />
  </>}>{shown.length ? <ReachTable rows={shown} columns={cols} rowKey={(c) => c.id} /> : <Empty text="Chưa có ứng viên." />}</Card>;
}
