// The OTA commission policy of the finance team ("CHÍNH SÁCH OTA"): the share of the room money an OTA keeps, by channel. Traveloka differs per hotel. Channels are the short names of channelOf (bluejay-revenue.ts); any other channel (walk-in, Zalo, BE...) keeps nothing.
// No imports: the daily revenue and the tests use it.
const FLAT: Record<string, number> = { Booking: 0.15, Expedia: 0.15, Trip: 0.18, Agoda: 0.20 };
const TRAVELOKA: Record<number, number> = { 5381: 0.20, 6209: 0.19, 6495: 0.19, 6836: 0.20 }; // Sontra Sea, Yzistel Hội An, Vistara Quy Nhơn, Vistara Gia Lai
const TRAVELOKA_OTHER = 0.20; // a hotel not listed above: shortcut, the top of the 17-20% range, add the hotel to TRAVELOKA

export function commissionRate(channel: string, hotelId: number) {
  return channel === "Traveloka" ? TRAVELOKA[hotelId] ?? TRAVELOKA_OTHER : FLAT[channel] ?? 0;
}
