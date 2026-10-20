import { GADS_MAX_DAYS, readGoogleAds } from "@/lib/google-ads";
import { socialRoute } from "@/lib/social-route";

export const maxDuration = 60;

// Google Ads figures of a date range from the stored days (GET); the page button re-pulls them from Windsor (POST).
export const { GET, POST } = socialRoute("gads", GADS_MAX_DAYS, readGoogleAds);
