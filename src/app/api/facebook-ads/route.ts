import { ADS_MAX_DAYS, readFacebookAds } from "@/lib/facebook-ads";
import { socialRoute } from "@/lib/social-route";

export const maxDuration = 60;

// Facebook Ads figures of a date range from the stored days (GET); the page button re-pulls them from Windsor (POST).
export const { GET, POST } = socialRoute("ads", ADS_MAX_DAYS, readFacebookAds);
