import { GA4_MAX_DAYS, readGoogleAnalytics } from "@/lib/google-analytics";
import { socialRoute } from "@/lib/social-route";

export const maxDuration = 60;

// Google Analytics 4 figures of a date range from the stored days (GET); the page button re-pulls them from Windsor (POST).
export const { GET, POST } = socialRoute("ga4", GA4_MAX_DAYS, readGoogleAnalytics);
