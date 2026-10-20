import { FB_MAX_DAYS, readFacebook } from "@/lib/facebook-page";
import { socialRoute } from "@/lib/social-route";

export const maxDuration = 60;

// Facebook Page figures of a date range from the stored days (GET); the page button re-pulls them from Windsor (POST).
export const { GET, POST } = socialRoute("facebook", FB_MAX_DAYS, readFacebook);
