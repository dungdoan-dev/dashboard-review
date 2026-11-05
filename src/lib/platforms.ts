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

/** Each platform's own colour on every report, so a reader knows the platform by its colour. Sampled from the official logos in public/platforms
 *  (Google: the blue of the Maps pin; Agoda, whose logo is five dots: its purple dot, the one no other platform uses). Google, Trip.com and Traveloka are all
 *  blues, so the chart legends and hover cards also show the logo next to the name (PlatformBrandLogo). */
export const PLATFORM_COLORS: Record<Platform, string> = {
  google: "#4285f4", tripadvisor: "#34e0a1", agoda: "#a3499b", booking: "#0c3b7c", expedia: "#fddb32", tripcom: "#2681ff", traveloka: "#1ba0e2",
  grabfood: "#00b14f", shopeefood: "#ee4d2d",
};

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
