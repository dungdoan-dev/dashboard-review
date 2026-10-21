// Runs the TikTok sync the page button runs, then counts the stored accounts. Prints the Supabase project id, names and counts only, never a key.
import { createClient } from "@supabase/supabase-js";
import { syncSocial } from "../src/lib/social-store.ts";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const day = (d) => new Date(Date.now() + 7 * 36e5 - d * 864e5).toISOString().slice(0, 10);
console.log("supabase project:", new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]);
console.log("sync:", await syncSocial(db, "tiktok", day(35), day(0)));
const { data, error } = await db.from("social_days").select("key,row").eq("source", "tiktok");
if (error) throw new Error(error.message);
const counts = {};
for (const d of data) counts[d.row.account_name] = (counts[d.row.account_name] ?? 0) + 1;
console.log(counts);
