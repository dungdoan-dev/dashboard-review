import type { LocationInput, LocationLinkPlatform, LocationRecord, Platform } from "@/lib/types";

export type PlatformUrlField =
  | "googleUrl"
  | "tripadvisorUrl"
  | "agodaUrl"
  | "bookingUrl"
  | "tripcomUrl"
  | "expediaUrl"
  | "travelokaUrl"
  | "grabfoodUrl"
  | "shopeefoodUrl";

export const PLATFORM_URL_FIELDS: Record<LocationLinkPlatform, PlatformUrlField> = {
  google: "googleUrl",
  tripadvisor: "tripadvisorUrl",
  agoda: "agodaUrl",
  booking: "bookingUrl",
  tripcom: "tripcomUrl",
  expedia: "expediaUrl",
  traveloka: "travelokaUrl",
  grabfood: "grabfoodUrl",
  shopeefood: "shopeefoodUrl",
};

export const DEFAULT_RATING_SCALE: Record<Platform, 5 | 10> = {
  google: 5,
  tripadvisor: 5,
  agoda: 10,
  booking: 10,
  expedia: 10,
  tripcom: 10,
  traveloka: 10,
  grabfood: 5,
  shopeefood: 5,
};

export function getPlatformUrl(
  value: Pick<LocationInput, PlatformUrlField> | Pick<LocationRecord, PlatformUrlField>,
  platform: Platform,
): string {
  return value[PLATFORM_URL_FIELDS[platform]] ?? "";
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  google: "Google Maps",
  tripadvisor: "Tripadvisor",
  agoda: "Agoda",
  booking: "Booking.com",
  tripcom: "Trip.com",
  expedia: "Expedia",
  traveloka: "Traveloka",
  grabfood: "GrabFood",
  shopeefood: "ShopeeFood",
};
