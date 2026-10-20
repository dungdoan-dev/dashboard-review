import { TT_MAX_DAYS, readTiktok } from "@/lib/tiktok-page";
import { socialRoute } from "@/lib/social-route";

export const maxDuration = 60;

// TikTok figures of a date range from the stored days (GET); the page button re-pulls them from Windsor (POST).
export const { GET, POST } = socialRoute("tiktok", TT_MAX_DAYS, readTiktok);
