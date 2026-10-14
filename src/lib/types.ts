export type Platform =
  | "google"
  | "tripadvisor"
  | "agoda"
  | "booking"
  | "expedia"
  | "tripcom"
  | "traveloka"
  | "grabfood";

export type LocationLinkPlatform = Platform | "shopeefood";

export type LocationType =
  | "hotel"
  | "cafe"
  | "mart"
  | "restaurant"
  | "resort"
  | "homestay"
  | "other";

export type Metric = {
  rating: number | null;
  ratingScale: number;
  reviewCount: number | null;
  countLabel: string;
  capturedAt: string;
  tripadvisorRank?: string | null;
  tripadvisorNotice?: string | null;
};

export type LocationRecord = {
  id: string;
  name: string;
  area: string;
  type: LocationType;
  googleUrl: string;
  tripadvisorUrl: string;
  agodaUrl: string;
  bookingUrl: string;
  tripcomUrl: string;
  expediaUrl?: string;
  travelokaUrl?: string;
  grabfoodUrl?: string;
  shopeefoodUrl?: string;
  google: Metric | null;
  tripadvisor: Metric | null;
  agoda: Metric | null;
  booking: Metric | null;
  tripcom: Metric | null;
  expedia?: Metric | null;
  traveloka?: Metric | null;
  grabfood?: Metric | null;
};

export type LocationInput = Pick<
  LocationRecord,
  "name" | "area" | "type" | "googleUrl" | "tripadvisorUrl" | "agodaUrl" | "bookingUrl" | "tripcomUrl"
> & {
  expediaUrl?: string;
  travelokaUrl?: string;
  grabfoodUrl?: string;
  shopeefoodUrl?: string;
};

export type SnapshotInput = {
  locationId: string;
  platform: Platform;
  rating: number | null;
  ratingScale: number;
  reviewCount: number | null;
  countLabel: string;
};
