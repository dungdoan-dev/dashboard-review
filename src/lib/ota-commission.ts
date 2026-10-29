// The OTA commission policy of the finance team ("CHÍNH SÁCH OTA"): the share of the room money an OTA keeps, by channel. Traveloka differs per hotel. Channels are the short names of channelOf (bluejay-revenue.ts); any other channel (walk-in, Zalo, BE...) keeps nothing.
// No imports: the daily revenue and the tests use it.
const FLAT: Record<string, number> = { Booking: 0.15, Expedia: 0.15, Trip: 0.18, Agoda: 0.20 };
const TRAVELOKA: Record<number, number> = { 5381: 0.20, 6209: 0.19, 6495: 0.19, 6836: 0.20 }; // Sontra Sea, Yzistel Hội An, Vistara Quy Nhơn, Vistara Gia Lai
const TRAVELOKA_OTHER = 0.20; // a hotel not listed above: shortcut, the top of the 17-20% range, add the hotel to TRAVELOKA

export function commissionRate(channel: string, hotelId: number) {
  return channel === "Traveloka" ? TRAVELOKA[hotelId] ?? TRAVELOKA_OTHER : FLAT[channel] ?? 0;
}

// "Giá đổ về Blujay" of the policy: Expedia, Trip and Agoda send the price already net of their commission, Booking and Traveloka send the displayed price (commission not deducted).
const NET_IN_BLUEJAY = new Set(["Expedia", "Trip", "Agoda"]);

/** The room money Blue Jay holds for a stay, split the way the revenue sheet shows it: gross (the displayed price) and the commission. A net price is grossed up (net / (1 - rate)), so the commission is not taken twice. */
export function otaSplit(channel: string, hotelId: number, money: number) {
  const rate = commissionRate(channel, hotelId);
  if (!rate) return { gross: money, commission: 0 };
  if (NET_IN_BLUEJAY.has(channel)) { const gross = money / (1 - rate); return { gross, commission: gross - money }; }
  return { gross: money, commission: money * rate };
}
