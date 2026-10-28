"use client";

import { useEffect, useState } from "react";
import type { SheetKind } from "@/lib/ledger-sheets";

type Branch = { hotel: number; hotelUrl: string | null; fnbUrl: string | null };
const pending = new Map<string, Promise<Branch[]>>();

/** Forget the links fetched so far (Cài đặt calls it after saving one). */
export const resetSheetUrls = () => pending.clear();

/** The Google Sheet link of a branch for a month and a kind (from Cài đặt → Link Google Sheet), null while loading or when the branch has none. Fetched once per month per page load. */
export function useSheetUrl(hotel: number | null, month: string, kind: SheetKind = "hotel") {
  const [loaded, setLoaded] = useState<{ month: string; branches: Branch[] }>({ month: "", branches: [] });
  useEffect(() => {
    if (!pending.has(month)) pending.set(month, fetch(`/api/bluejay/branch-sheets?month=${encodeURIComponent(month)}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : { branches: [] })).then((b) => (b.branches ?? []) as Branch[]).catch(() => []));
    let active = true;
    void pending.get(month)!.then((branches) => { if (active) setLoaded({ month, branches }); });
    return () => { active = false; };
  }, [month]);
  const branch = loaded.month === month ? loaded.branches.find((b) => b.hotel === hotel) : undefined;
  return (kind === "fnb" ? branch?.fnbUrl : branch?.hotelUrl) ?? null;
}
