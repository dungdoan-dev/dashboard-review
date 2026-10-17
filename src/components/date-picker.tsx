"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { DayPicker, type Matcher } from "react-day-picker";
import { vi } from "react-day-picker/locale";
import "react-day-picker/style.css";
import { fmtDate, parseDmy } from "@/lib/format-date";

// Every date on the site is typed and shown as dd/mm/yyyy, and the calendar runs Monday to Sunday (Vietnam).
// The browser's own <input type="date"> follows the visitor's locale (mm/dd/yyyy, Sunday first), so it is not used anywhere;
// the calendar itself is react-day-picker with the Vietnamese locale and weekStartsOn = Monday.
const pad = (n: number) => String(n).padStart(2, "0");
const vnToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
const toDate = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))); // local midnight, so the day never shifts
const toIso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

type Props = {
  text: string;                          // dd/mm/yyyy as typed (may be incomplete while typing)
  onText: (text: string) => void;        // typing; also called with the picked date unless onPick is given
  onPick?: (iso: string) => void;        // a day picked in the calendar (yyyy-mm-dd)
  onBlurText?: () => void;
  label: string;
  min?: string;                          // yyyy-mm-dd
  max?: string;                          // yyyy-mm-dd
  mondaysOnly?: boolean;
};

/** Text field plus a Monday-first calendar popup. Controlled by dd/mm/yyyy text; see IsoDatePicker for a yyyy-mm-dd value. */
export function DatePicker({ text, onText, onPick, onBlurText, label, min, max, mondaysOnly }: Props) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => toDate(parseDmy(text) ?? vnToday()));
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  const selected = parseDmy(text);
  const disabled: Matcher[] = [];
  if (min) disabled.push({ before: toDate(min) });
  if (max) disabled.push({ after: toDate(max) });
  if (mondaysOnly) disabled.push({ dayOfWeek: [0, 2, 3, 4, 5, 6] });

  return <span className="date-picker" ref={root}>
    <input type="text" inputMode="numeric" placeholder="dd/mm/yyyy" size={10} value={text} onChange={(event) => onText(event.target.value)} onBlur={onBlurText} aria-label={`${label} (dd/mm/yyyy)`} />
    <button type="button" className="date-picker-toggle" aria-label={`Mở lịch chọn ${label.toLowerCase()}`} aria-expanded={open} aria-haspopup="dialog"
      onClick={() => { if (!open) setMonth(toDate(parseDmy(text) ?? vnToday())); setOpen(!open); }}><CalendarDays size={15} /></button>
    {open && <div className="date-picker-popover" role="dialog" aria-label={`Lịch ${label.toLowerCase()}`}>
      <DayPicker mode="single" locale={vi} weekStartsOn={1} month={month} onMonthChange={setMonth} today={toDate(vnToday())}
        selected={selected ? toDate(selected) : undefined} disabled={disabled}
        onSelect={(date) => { if (!date) return; const iso = toIso(date); if (onPick) onPick(iso); else onText(fmtDate(iso)); setOpen(false); }} />
    </div>}
  </span>;
}

/** Same picker for a yyyy-mm-dd value: keeps what is being typed until the field loses focus or a day is picked. */
export function IsoDatePicker({ value, onChange, ...rest }: Omit<Props, "text" | "onText" | "onPick" | "onBlurText"> & { value: string; onChange: (iso: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return <DatePicker {...rest} text={draft ?? (value ? fmtDate(value) : "")}
    onText={(text) => { setDraft(text); const iso = parseDmy(text); if (iso) onChange(iso); else if (!text) onChange(""); }}
    onPick={(iso) => { setDraft(null); onChange(iso); }} onBlurText={() => setDraft(null)} />;
}
