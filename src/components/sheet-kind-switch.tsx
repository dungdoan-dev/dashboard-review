"use client";

import { SHEET_KINDS, type SheetKind } from "@/lib/ledger-sheets";

/** Khách sạn | Ăn sáng, cafe, mini mart: which of a branch's two Google Sheets a page reads. */
export function SheetKindSwitch({ value, onChange }: { value: SheetKind; onChange: (kind: SheetKind) => void }) {
  return <div className="range-presets" role="group" aria-label="Loại sheet" style={{ marginLeft: 0, marginBottom: 12 }}>
    {SHEET_KINDS.map((k) => <button type="button" key={k.kind} aria-pressed={k.kind === value} onClick={() => onChange(k.kind)}>{k.label}</button>)}
  </div>;
}
