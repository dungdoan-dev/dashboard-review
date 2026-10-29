"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { ROLES } from "@/lib/user-roles";
import { fmtDateTime } from "@/lib/format-date";

type Account = { id: string; email: string; role: string | null; lastSignIn: string | null };
type State = { me: string | null; users: Account[] };

async function load(): Promise<State | { message: string }> {
  const res = await fetch("/api/users", { cache: "no-store" }).catch(() => null);
  if (!res) return { message: "Không kết nối được máy chủ." };
  const body = await res.json().catch(() => ({}));
  return res.ok ? body : { message: body.message ?? `Lỗi HTTP ${res.status}` };
}

/** Cài đặt → Phân quyền: what each account may open. New accounts are still created in Supabase (Authentication → Add user). */
export function RoleSettings() {
  const [data, setData] = useState<State | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const apply = useCallback((r: State | { message: string }) => { if ("message" in r) setMessage(r.message); else setData(r); }, []);
  useEffect(() => {
    let active = true;
    void load().then((r) => { if (active) apply(r); });
    return () => { active = false; };
  }, [apply]);

  async function change(account: Account, role: string) {
    setBusy(account.id); setMessage("");
    const res = await fetch("/api/users", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: account.id, role }) }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setMessage(!res ? "Không kết nối được máy chủ." : res.ok ? `Đã đổi quyền của ${account.email}. Có hiệu lực khi người đó đăng nhập lại (hoặc trong vòng một giờ).` : body.message ?? `Lỗi HTTP ${res.status}`);
    if (res?.ok) apply(await load());
    setBusy("");
  }

  return <section className="automatic-sync-section role-settings" aria-labelledby="role-settings-title">
    <div className="automatic-sync-heading"><div className="section-kicker"><ShieldCheck size={14} /> CÀI ĐẶT · PHÂN QUYỀN</div><h2 id="role-settings-title">Phân quyền tài khoản</h2>
      <p>Chọn mỗi tài khoản được dùng phần nào. Tài khoản mới tạo ở Supabase (Authentication → Add user) sẽ hiện ở đây với trạng thái “Chưa cấp quyền”.</p></div>
    <ul className="role-legend">{ROLES.map((r) => <li key={r.value}><strong>{r.label}</strong> {r.note}</li>)}</ul>
    {!data ? <p>{message || "Đang tải tài khoản…"}</p> : <div className="table-panel"><div className="table-scroll"><table className="role-table">
      <thead><tr><th>Tài khoản</th><th>Vai trò</th><th>Đăng nhập gần nhất</th></tr></thead>
      <tbody>{data.users.map((u) => <tr key={u.id}>
        <td>{u.email}{u.id === data.me && <small className="role-self"> (bạn)</small>}</td>
        <td><label className="field"><span className="sr-only">Vai trò của {u.email}</span>
          <select value={u.role ?? ""} disabled={!!busy || u.id === data.me} onChange={(event) => void change(u, event.target.value)}>
            <option value="">Chưa cấp quyền</option>
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            {u.role && !ROLES.some((r) => r.value === u.role) && <option value={u.role}>{u.role} (không rõ)</option>}
          </select></label>{busy === u.id && <LoaderCircle size={14} className="spin" />}</td>
        <td>{u.lastSignIn ? fmtDateTime(u.lastSignIn) : "Chưa đăng nhập"}</td>
      </tr>)}</tbody></table></div></div>}
    {data && message && <p role="status" className="role-message">{message}</p>}
    {!data && message && <p role="alert">{message}</p>}
  </section>;
}
