// One spreadsheet per hotel (cash ledger tabs and the kho tabs MINIBAR/AMENITIES/VẬT TƯ/ĐỒ VẢI of each month), shared (view only) with the service account in GOOGLE_SERVICE_ACCOUNT_JSON. Add a hotel here when its sheet is ready.
// Only ids (not secret), no imports: the page uses this to link to the sheet.
export const LEDGER_SHEETS: Record<number, string> = {
  5381: "1HvweFPj0RlzUA3qUaBYVQOoHh8PrBLpuTvDIqIelTmU", // Sontra Sea
  6836: "1LJgUrctGwBPcynAjdHZlG4u8kbhCpuZGk4R9GWxciOk", // Vistara Gia Lai
  6495: "1b_38S409K5glxanqYGUU8IpsKroV0Gq8h5ppeK006Tc", // Vistara Quy Nhon
  6209: "15_6wGXPamuVApuTmyeUDH01J2OFHgr-d0GeTWVUhcIo", // Yzistel Hoi An
};

/** Address of a hotel's ledger spreadsheet (no tab), to open it in the browser. */
export const ledgerSheetUrl = (hotel: number) => (LEDGER_SHEETS[hotel] ? `https://docs.google.com/spreadsheets/d/${LEDGER_SHEETS[hotel]}/edit` : null);
