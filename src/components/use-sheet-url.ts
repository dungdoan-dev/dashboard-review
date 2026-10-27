"use client";

import { useEffect, useState } from "react";
import type { SheetKind } from "@/lib/ledger-sheets";

type Branch = { hotel: number; hotelUrl: string | null; fnbUrl: string | null };
let pending: Promise<Branch[]> | null = null;

/** Forget the links fetched so far (Cài đặt calls it after saving one). */
export const resetSheetUrls = () => { pending = null; };

/** The Google Sheet link of a branch for a kind (from Cài đặt → Link Google Sheet), null while loading or when the branch has none. Fetched once per page load. */
export function useSheetUrl(hotel: number | null, kind: SheetKind = "hotel") {
  const [branches, setBranches] = useState<Branch[]>([]);
  useEffect(() => {
    pending ??= fetch("/api/bluejay/branch-sheets", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { branches: [] })).then((b) => (b.branches ?? []) as Branch[]).catch(() => []);
    let active = true;
    void pending.then((b) => { if (active) setBranches(b); });
    return () => { active = false; };
  }, []);
  const branch = branches.find((b) => b.hotel === hotel);
  return (kind === "fnb" ? branch?.fnbUrl : branch?.hotelUrl) ?? null;
}
