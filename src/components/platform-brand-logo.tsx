import type { Platform } from "@/lib/types";

// The platforms' own marks, downloaded once into public/platforms: Wikimedia Commons for Google Maps, Tripadvisor (its owl, shrunk to PNG),
// Booking.com, Trip.com, Expedia and Shopee (ShopeeFood); the sites' own square icons for Agoda, Traveloka and GrabFood (Commons has only their wordmarks).
const FILES: Record<Platform, string> = {
  google: "google.svg", tripadvisor: "tripadvisor.png", booking: "booking.svg", tripcom: "tripcom.png", expedia: "expedia.png",
  agoda: "agoda.png", traveloka: "traveloka.png", grabfood: "grabfood.png", shopeefood: "shopeefood.svg",
};

/** The platform's logo, sized by its box (the source filter chips, the branch detail platform headings). Decorative: the name is always written next to it. */
export function PlatformBrandLogo({ platform }: { platform: Platform }) {
  const file = FILES[platform];
  // eslint-disable-next-line @next/next/no-img-element -- tiny static icons: next/image would only add a wrapper and a loader
  return file ? <img src={`/platforms/${file}`} alt="" aria-hidden="true" width={24} height={24} loading="lazy" decoding="async" /> : null;
}
