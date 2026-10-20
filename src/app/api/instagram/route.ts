import { IG_MAX_DAYS, readInstagram } from "@/lib/instagram-page";
import { socialRoute } from "@/lib/social-route";

export const maxDuration = 60;

// Instagram figures of a date range from the stored days (GET); the page button re-pulls them from Windsor (POST).
export const { GET, POST } = socialRoute("instagram", IG_MAX_DAYS, readInstagram);
