// Prints which TikTok accounts the server's API_WINDSOR key returns (names and row counts only, never the key).
const key = process.env.API_WINDSOR?.trim();
if (!key) throw new Error("API_WINDSOR is not set");
const day = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
const url = `https://connectors.windsor.ai/tiktok_organic?${new URLSearchParams({ date_from: day(35), date_to: day(0), fields: "date,account_id,account_name,video_views", api_key: key })}`;
const body = await (await fetch(url)).json();
if (body.error) throw new Error(String(body.error).slice(0, 200));
const counts = {};
for (const r of body.data ?? []) counts[`${r.account_name} (${r.account_id})`] = (counts[`${r.account_name} (${r.account_id})`] ?? 0) + 1;
console.log(counts);
