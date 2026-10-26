"use client";

import { useEffect, useState, type FormEvent } from "react";
import { LoaderCircle, X } from "lucide-react";
import { HR_FORMS, type FieldDef, type HrEntity } from "@/lib/hr-forms";

export type Option = [value: string, label: string];
type Values = Record<string, string>;

function Field({ def, value, options }: { def: FieldDef; value: string; options: Option[] }) {
  const common = { name: def.key, required: def.required, defaultValue: value };
  return <label className={`field${def.wide || def.type === "textarea" ? " full-field" : ""}`}>{def.label}{def.required && " *"}
    {def.type === "textarea" ? <textarea {...common} rows={3} maxLength={2000} />
      : def.type === "select" ? <select {...common}><option value="">-- Chọn --</option>{value && !options.some(([v]) => v === value) && <option value={value}>{value}</option>}{options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select>
        : <input {...common} type={def.type} maxLength={300} {...(def.type === "number" ? { min: 0, max: 9999, step: 1 } : {})} />}
  </label>;
}

function Modal({ title, kicker, onClose, children }: { title: string; kicker: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="hr-modal-title">
      <header className="modal-header">
        <div><span className="section-kicker">{kicker}</span><h2 id="hr-modal-title">{title}</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng"><X size={16} /></button>
      </header>
      {children}
    </section>
  </div>;
}

/** Create (no id) or edit (id) form of one row; onSubmit gets the typed values and returns an error message, or null when saved. */
export function RecordDialog({ entity, id, initial, optionsOf, onSubmit, onClose }: { entity: HrEntity; id?: string; initial: Values; optionsOf: (def: FieldDef) => Option[]; onSubmit: (values: Values) => Promise<string | null>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const form = HR_FORMS[entity];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const failure = await onSubmit(Object.fromEntries(new FormData(event.currentTarget).entries()) as Values);
    setBusy(false);
    if (failure) setError(failure); else onClose();
  }
  return <Modal title={`${id ? "Sửa" : "Thêm"} ${form.title}${id ? ` ${id}` : ""}`} kicker="NHÂN SỰ" onClose={() => { if (!busy) onClose(); }}>
    <form onSubmit={submit}>
      {error && <div className="modal-error" role="alert">{error}</div>}
      <div className="form-grid">{form.fields.map((def) => <Field key={def.key} def={def} value={initial[def.key] ?? ""} options={def.type === "select" ? optionsOf(def) : []} />)}</div>
      <div className="modal-footer">
        <button type="button" className="button button-outline" disabled={busy} onClick={onClose}>Hủy</button>
        <button type="submit" className="button button-primary" disabled={busy}>{busy && <LoaderCircle size={15} className="spin" />}{busy ? "Đang lưu…" : "Lưu"}</button>
      </div>
    </form>
  </Modal>;
}

/** Asks before a row is removed from the sheet. onConfirm returns an error message, or null when deleted. */
export function ConfirmDialog({ label, onConfirm, onClose }: { label: string; onConfirm: () => Promise<string | null>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    setBusy(true); setError("");
    const failure = await onConfirm();
    setBusy(false);
    if (failure) setError(failure); else onClose();
  }
  return <Modal title="Xóa dòng này?" kicker="XÁC NHẬN" onClose={() => { if (!busy) onClose(); }}>
    {error && <div className="modal-error" role="alert">{error}</div>}
    <p className="hr-confirm">Dòng <strong>{label}</strong> sẽ bị xóa khỏi Google Sheet. Không hoàn tác được từ dashboard.</p>
    <div className="modal-footer">
      <button type="button" className="button button-outline" disabled={busy} onClick={onClose} autoFocus>Hủy</button>
      <button type="button" className="button button-primary hr-danger" disabled={busy} onClick={() => void confirm()}>{busy && <LoaderCircle size={15} className="spin" />}Xóa</button>
    </div>
  </Modal>;
}
