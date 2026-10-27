"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Briefcase, CalendarClock, GraduationCap, MapPin, Phone, Search, UserRound } from "lucide-react";
import { fmtDate } from "@/lib/format-date";
import { ageOn, isLeft, tenureText, type HrStaffRow } from "@/lib/hr-staff";

const plain = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gi, "d").toLowerCase();
const initials = (name: string) => { const w = name.trim().split(/\s+/).filter(Boolean); return (w.length > 1 ? w[0][0] + w[w.length - 1][0] : (w[0] ?? "?").slice(0, 2)).toUpperCase(); };
const date = (d: string | null) => (d ? fmtDate(d) : "");
const daysTo = (d: string | null, today: string) => (d ? Math.round((Date.parse(d) - Date.parse(today)) / 86_400_000) : null);
export const staffKey = (s: HrStaffRow) => `${s.unit}|${s.staff_id}`;

type Row = [label: string, value: string, href?: string];
const Card = ({ icon, title, rows }: { icon: ReactNode; title: string; rows: Row[] }) => (
  <section className="np-card">
    <h4>{icon}{title}</h4>
    <dl>{rows.map(([label, value, href]) => <div key={label}><dt>{label}</dt><dd className={value ? undefined : "np-empty"}>{!value ? "Chưa có" : href ? <a href={href} {...(href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{href.startsWith("http") ? "Mở file" : value}</a> : value}</dd></div>)}</dl>
  </section>
);

/** Hồ sơ NV: a searchable list of people on the left, the chosen person's profile on the right (no ID card, insurance, tax, salary or bank account). */
export function NhanSuProfile({ staff, picked, onPick, today }: { staff: HrStaffRow[]; picked: string; onPick: (key: string) => void; today: string }) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => { const q = plain(query.trim()); return q ? staff.filter((s) => plain(`${s.name} ${s.staff_id} ${s.position} ${s.department}`).includes(q)) : staff; }, [staff, query]);
  const s = staff.find((x) => staffKey(x) === picked) ?? staff[0];
  if (!s) return <p className="summary-note">Chưa có nhân viên.</p>;

  const left = isLeft(s), age = s.birth_date ? ageOn(s.birth_date, today) : null;
  const contractIn = daysTo(s.contract_end, today), probationIn = daysTo(s.probation_end, today);
  const alerts = [
    !left && contractIn !== null && contractIn >= 0 && contractIn <= 60 ? `Hợp đồng hết hạn sau ${contractIn} ngày` : "",
    !left && probationIn !== null && probationIn >= 0 && probationIn <= 30 ? `Kết thúc thử việc sau ${probationIn} ngày` : "",
  ].filter(Boolean);
  const facts: [string, string][] = [["Thâm niên", tenureText(s.start_date, s.end_date, today)], ["Tuổi", age === null ? "" : String(age)], ["Ngày vào làm", date(s.start_date)], ["Phòng ban", s.department]];

  return (
    <div className="np">
      <aside className="np-side">
        <label className="np-search"><Search size={15} aria-hidden="true" /><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm tên, mã NV, vị trí" aria-label="Tìm nhân viên" /></label>
        <ul className="np-list" aria-label="Danh sách nhân viên">
          {shown.map((x) => <li key={staffKey(x)}>
            <button type="button" className="np-item" aria-current={staffKey(x) === staffKey(s) ? "true" : undefined} onClick={() => onPick(staffKey(x))}>
              <span className="np-avatar" aria-hidden="true">{initials(x.name)}</span>
              <span className="np-item-text"><strong>{x.name || x.staff_id}</strong><small>{x.position || x.department || "—"} · {x.unit}</small></span>
              {isLeft(x) && <span className="hr-badge red">Đã nghỉ</span>}
            </button>
          </li>)}
        </ul>
        {shown.length === 0 && <p className="summary-note">Không có ai khớp “{query}”.</p>}
        <p className="np-count">{shown.length}/{staff.length} người</p>
      </aside>

      <article className="np-main" aria-label={`Hồ sơ ${s.name}`}>
        <header className="np-head">
          <span className="np-avatar np-avatar-lg" aria-hidden="true">{initials(s.name)}</span>
          <div>
            <h3>{s.name || s.staff_id}</h3>
            <p>{[s.staff_id, s.position, s.unit].filter(Boolean).join(" · ")}</p>
            <div className="np-tags">
              <span className={`hr-badge ${left ? "red" : "green"}`}>{s.status || (left ? "Đã nghỉ" : "Đang làm")}</span>
              {s.job_type && <span className="hr-badge">{s.job_type}</span>}
              {s.level && <span className="hr-badge azure">{s.level}</span>}
              {alerts.map((a) => <span key={a} className="hr-badge orange">{a}</span>)}
            </div>
          </div>
        </header>
        <dl className="np-facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className={value ? undefined : "np-empty"}>{value || "—"}</dd></div>)}</dl>
        <div className="np-cards">
          <Card icon={<Briefcase size={15} aria-hidden="true" />} title="Công việc" rows={[["Phòng ban", s.department], ["Vị trí", s.position], ["Cấp bậc", s.level], ["Loại công việc", s.job_type], ["Nguồn tuyển dụng", s.hiring_source], ["Ngày bắt đầu", date(s.start_date)]]} />
          <Card icon={<UserRound size={15} aria-hidden="true" />} title="Cá nhân" rows={[["Giới tính", s.gender], ["Ngày sinh", date(s.birth_date)], ["Hôn nhân", s.marital], ["Số người con", s.children], ["Dân tộc", s.ethnicity], ["Tôn giáo", s.religion], ["Quốc tịch", s.nationality]]} />
          <Card icon={<Phone size={15} aria-hidden="true" />} title="Liên lạc" rows={[["Số điện thoại", s.phone, s.phone ? `tel:${s.phone.replace(/\s/g, "")}` : undefined], ["Email công việc", s.work_email, s.work_email ? `mailto:${s.work_email}` : undefined], ["Email cá nhân", s.personal_email, s.personal_email ? `mailto:${s.personal_email}` : undefined]]} />
          <Card icon={<MapPin size={15} aria-hidden="true" />} title="Địa chỉ" rows={[["Địa chỉ", s.address], ["Huyện/Quận", s.district], ["Tỉnh/TP", s.province]]} />
          <Card icon={<GraduationCap size={15} aria-hidden="true" />} title="Học vấn" rows={[["Trình độ", s.education], ["Nơi đào tạo", s.school], ["Chuyên ngành", s.major], ["Chứng chỉ", s.certificate], ["Năm tốt nghiệp", s.grad_year], ["Xếp loại", s.grade]]} />
          <Card icon={<CalendarClock size={15} aria-hidden="true" />} title="Thử việc và hợp đồng" rows={[["Ngày thử việc", date(s.probation_start)], ["Kết thúc thử việc", date(s.probation_end)], ["Kết quả thử việc", s.probation_status], ["Loại hợp đồng", s.contract_type], ["Hết hạn hợp đồng", date(s.contract_end)], ["File hợp đồng", s.contract_link, /^https?:\/\//.test(s.contract_link) ? s.contract_link : undefined], ...(left ? [["Ngày nghỉ việc", date(s.end_date)], ["Lý do nghỉ việc", s.leave_reason]] as Row[] : [])]} />
        </div>
      </article>
    </div>
  );
}
