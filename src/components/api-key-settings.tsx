"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Eye, EyeOff, KeyRound, LoaderCircle } from "lucide-react";
import { fmtDateTime } from "@/lib/format-date";

type Key = { name: string; label: string; note: string; source: "database" | "env" | "none"; tail: string; updatedAt: string | null };
type State = { tableReady: boolean; keys: Key[] };
type Reply = { message?: string; value?: string } & Partial<State>;

async function call(method: string, query = "", body?: object): Promise<{ ok: boolean; data: Reply }> {
  const res = await fetch(`/api/app-secrets${query}`, { method, cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
  if (!res) return { ok: false, data: { message: "Không kết nối được máy chủ." } };
  return { ok: res.ok, data: await res.json().catch(() => ({ message: `Lỗi HTTP ${res.status}` })) };
}

const STATE_TEXT = { database: "Database", env: ".env", none: "Chưa đặt" } as const;

/** One key: a password-style field (the stored value is only fetched when the eye is pressed), Save and, for a stored value, "Dùng .env". */
function KeyRow({ k, tableReady, onChanged, onMessage }: { k: Key; tableReady: boolean; onChanged: () => Promise<void>; onMessage: (text: string, error: boolean) => void }) {
  const id = useId();
  const [value, setValue] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState<"" | "eye" | "save" | "drop">("");
  const dirty = value.trim() !== "";

  async function toggle() {
    if (!shown && !dirty && k.source !== "none") { // first look at a stored value: fetch it, then show it
      setBusy("eye");
      const r = await call("GET", `?name=${encodeURIComponent(k.name)}`);
      setBusy("");
      if (!r.ok) return onMessage(`${k.label}: ${r.data.message ?? "Không lấy được giá trị."}`, true);
      setValue(r.data.value ?? "");
    }
    setShown(!shown);
  }

  async function run(action: "save" | "drop") {
    setBusy(action); onMessage("", false);
    const r = action === "save" ? await call("PUT", "", { name: k.name, value }) : await call("DELETE", `?name=${encodeURIComponent(k.name)}`);
    setBusy("");
    if (!r.ok) return onMessage(`${k.label}: ${r.data.message ?? "Không lưu được."}`, true);
    setValue(""); setShown(false);
    onMessage(action === "save" ? `Đã lưu ${k.label}. Máy chủ dùng giá trị mới trong vòng 1 phút.` : `Đã bỏ bản trong database của ${k.label}, quay về dùng .env.`, false);
    await onChanged();
  }

  const hint = k.source === "none" ? "Nhập giá trị" : `Đã đặt${k.tail ? ` · …${k.tail}` : ""}`;
  const fieldProps = { id, "aria-label": `Giá trị của ${k.label}`, autoComplete: "off", spellCheck: false, value, placeholder: hint, onChange: (e: { target: { value: string } }) => setValue(e.target.value) };
  return <li className="api-key-row">
    <div className="api-key-name" title={k.note}><strong>{k.label}</strong><small>{k.note}</small></div>
    <span className={`api-key-state ${k.source}`} title={k.source === "database" && k.updatedAt ? `Đổi ${fmtDateTime(k.updatedAt)}` : undefined}>{STATE_TEXT[k.source]}</span>
    <div className="api-key-field">
      <input {...fieldProps} name={`secret-${k.name}`} type={shown ? "text" : "password"} />
      <button type="button" className="api-key-eye" aria-label={`${shown ? "Ẩn" : "Hiện"} giá trị của ${k.label}`} aria-pressed={shown} disabled={busy !== "" || (k.source === "none" && !dirty)} onClick={() => void toggle()}>
        {busy === "eye" ? <LoaderCircle size={16} className="spin" /> : shown ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
    <div className="api-key-actions">
      <button type="button" className="button button-primary" disabled={busy !== "" || !tableReady || !dirty} onClick={() => void run("save")}>{busy === "save" ? <LoaderCircle size={14} className="spin" /> : null}Lưu</button>
      {k.source === "database" && <button type="button" className="button button-outline" disabled={busy !== ""} onClick={() => void run("drop")}>Dùng .env</button>}
    </div>
  </li>;
}

/** Cài đặt → Khóa API: the keys of other services, kept encrypted in the database (a key with no stored value uses the server's .env). */
export function ApiKeySettings() {
  const [data, setData] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ text: string; error: boolean }>({ text: "", error: false });

  const reload = useCallback(async () => {
    const r = await call("GET");
    if (r.ok && r.data.keys) setData({ tableReady: r.data.tableReady !== false, keys: r.data.keys });
    else setError(r.data.message ?? "Không tải được danh sách khóa.");
  }, []);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);

  return <section className="automatic-sync-section role-settings" aria-labelledby="api-key-title">
    <div className="automatic-sync-heading"><div className="section-kicker"><KeyRound size={14} /> CÀI ĐẶT · KHÓA API</div><h2 id="api-key-title">Khóa API và mã truy cập</h2>
      <p>Khóa của dịch vụ bên ngoài được mã hóa trong database. Đổi ở đây có hiệu lực ngay, không cần sửa .env hay deploy lại. Bấm biểu tượng mắt để xem giá trị đang dùng. Khóa chưa lưu ở đây vẫn dùng giá trị trong .env.</p></div>
    {data && !data.tableReady && <p role="alert">Chưa có bảng lưu khóa: chạy <code>supabase/migrations/20261103000000_app_secrets.sql</code> trong Supabase SQL Editor.</p>}
    {!data ? <p role={error ? "alert" : "status"}>{error || "Đang tải…"}</p> : <ul className="api-key-list">{data.keys.map((k) => <KeyRow key={k.name} k={k} tableReady={data.tableReady} onChanged={reload} onMessage={(text, isError) => setNotice({ text, error: isError })} />)}</ul>}
    {notice.text && <p role={notice.error ? "alert" : "status"} className={notice.error ? "api-key-error" : "role-message"}>{notice.text}</p>}
  </section>;
}
