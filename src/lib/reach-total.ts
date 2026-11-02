// The "báo cáo tổng" of Tiếp cận: every reach channel for one date range as plain tables (shown on /reach and written to Excel).
// The columns are the ones of each channel's own page (Facebook, Instagram, ...), so keep them in step with those pages. No "@/" imports: tested with plain Node.
import { fmtDate } from "./format-date.ts";
import { additive } from "./reach-sum.ts";
import { resultLabel, ADS_MAX_DAYS } from "./facebook-ads.ts";
import { GADS_MAX_DAYS } from "./google-ads.ts";
import { GA4_MAX_DAYS } from "./google-analytics.ts";
import { FB_MAX_DAYS } from "./facebook-page.ts";
import { IG_MAX_DAYS } from "./instagram-page.ts";
import { TT_MAX_DAYS } from "./tiktok-page.ts";
import { MAX_DAYS } from "./google-profile.ts";
import type { AdsDaily, AdsTotals } from "./facebook-ads.ts";
import type { GadsDaily, GadsTotals } from "./google-ads.ts";
import type { Ga4Totals } from "./google-analytics.ts";
import type { FbDaily, FbTotals } from "./facebook-page.ts";
import type { IgDaily, IgTotals } from "./instagram-page.ts";
import type { TtDaily, TtTotals } from "./tiktok-page.ts";
import type { DailyRow, LocationTotals } from "./google-profile.ts";

export type Cell = string | number | null;
/** One table: head, rows, and per column whether it adds up in a total row. */
export type Block = { title: string; head: string[]; rows: Cell[][]; sum: boolean[] };
export type ChannelTables = { name: string; summary: Block[]; daily: Block | null; error?: string };
export type Channel = { key: string; name: string; api: string; maxDays: number; build: (body: Record<string, unknown>) => { summary: Block[]; daily: Block } };

type Metric<R> = [label: string, value: (r: R) => Cell];
type Site = Ga4Totals & { site: string };
type Source = Site & { source: string; medium: string };
type SiteDay = Site & { day: string };

function block<R>(title: string, first: Metric<R>[], metrics: Metric<R>[], rows: R[]): Block {
  const cols = [...first, ...metrics];
  return { title, head: cols.map(([label]) => label), rows: rows.map((r) => cols.map(([, value]) => value(r))), sum: [...first.map(() => false), ...metrics.map(([label]) => additive(label))] };
}
const list = <R,>(body: Record<string, unknown>, key: string) => (Array.isArray(body[key]) ? body[key] : []) as R[];
const dayCol = <R extends { day: string }>(): Metric<R> => ["Ngày", (r) => fmtDate(r.day)];

const GA4: Metric<Ga4Totals>[] = [["Phiên", (t) => t.sessions], ["Người dùng", (t) => t.users], ["Người dùng mới", (t) => t.newUsers], ["Phiên có tương tác", (t) => t.engagedSessions], ["Tỷ lệ tương tác", (t) => t.engagementRate], ["Lượt xem trang", (t) => t.views], ["Chuyển đổi", (t) => t.conversions]];
const ADS: Metric<AdsTotals>[] = [["Chi phí (VND)", (t) => t.spend], ["Kết quả", (t) => t.results], ["Loại kết quả", (t) => (t.results ? resultLabel(t.resultType) : "—")], ["Chi phí / kết quả (VND)", (t) => t.costPerResult], ["Hiển thị", (t) => t.impressions], ["Người tiếp cận", (t) => t.reach], ["Tần suất", (t) => t.frequency], ["Lượt nhấp", (t) => t.clicks], ["Nhấp liên kết", (t) => t.linkClicks], ["CTR", (t) => t.ctr], ["CPC (VND)", (t) => t.cpc], ["Tin nhắn mới", (t) => t.messages], ["Chi phí / tin nhắn (VND)", (t) => t.costPerMessage]];
const ADS_DAY: Metric<AdsDaily>[] = [["Chi phí (VND)", (d) => d.spend], ["Kết quả", (d) => d.results], ["Hiển thị", (d) => d.impressions], ["Người tiếp cận", (d) => d.reach], ["Lượt nhấp", (d) => d.clicks], ["Nhấp liên kết", (d) => d.linkClicks], ["Tin nhắn mới", (d) => d.messages]];
const GADS: Metric<GadsTotals>[] = [["Chi phí (VND)", (t) => t.spend], ["Hiển thị", (t) => t.impressions], ["Lượt nhấp", (t) => t.clicks], ["CTR", (t) => t.ctr], ["CPC (VND)", (t) => t.cpc], ["Chuyển đổi", (t) => t.conversions], ["Chi phí / chuyển đổi (VND)", (t) => t.costPerConversion]];
const GADS_DAY: Metric<GadsDaily>[] = [["Chi phí (VND)", (d) => d.spend], ["Hiển thị", (d) => d.impressions], ["Lượt nhấp", (d) => d.clicks], ["Chuyển đổi", (d) => d.conversions]];
const GMAPS = <R extends Omit<LocationTotals, "days">>(): Metric<R>[] => [["Lượt tương tác", (t) => t.engagement], ["Cuộc gọi", (t) => t.calls], ["Tìm đường", (t) => t.directions], ["Nhấp vào web", (t) => t.website], ["Nhấp đặt phòng/thực đơn", (t) => t.bookingMenu], ["Số post bài", (t) => t.posts]];
const FB: Metric<FbTotals>[] = [["Lượt xem", (t) => t.views], ["Người xem", (t) => t.viewers], ["Lượt tương tác", (t) => t.engagement], ["Lượt truy cập", (t) => t.visits], ["Lượt theo dõi", (t) => t.follows], ["Số post bài", (t) => t.posts]];
const FB_DAY: Metric<FbDaily>[] = [["Lượt xem", (d) => d.views], ["Lượt tương tác", (d) => d.engagement], ["Lượt truy cập", (d) => d.visits], ["Lượt theo dõi", (d) => d.follows]];
const IG: Metric<IgTotals>[] = [["Lượt xem", (t) => t.views], ["Người tiếp cận", (t) => t.reach], ["Lượt tương tác", (t) => t.engagement], ["Lượt click liên kết", (t) => t.linkClicks], ["Số post bài", (t) => t.posts]];
const IG_DAY: Metric<IgDaily>[] = [["Lượt xem", (d) => d.views], ["Người tiếp cận", (d) => d.reach], ["Lượt tương tác", (d) => d.engagement], ["Lượt click liên kết", (d) => d.linkClicks]];
const TT: Metric<TtTotals>[] = [["Lượt xem video", (t) => t.views], ["Đối tượng tiếp cận", (t) => t.reach], ["Lượt xem hồ sơ", (t) => t.profileViews], ["Lượt nhấp SĐT", (t) => t.phoneClicks], ["Số post bài", (t) => t.posts], ["Lượt nhấp web", (t) => t.linkClicks], ["Người theo dõi mới", (t) => t.follows]];
const TT_DAY: Metric<TtDaily>[] = [["Lượt xem video", (d) => d.views], ["Đối tượng tiếp cận", (d) => d.reach], ["Lượt xem hồ sơ", (d) => d.profileViews], ["Lượt nhấp SĐT", (d) => d.phoneClicks], ["Lượt nhấp web", (d) => d.linkClicks], ["Người theo dõi mới", (d) => d.follows]];

/** In the order of the Tiếp cận menu. maxDays: the longest range the channel's own API accepts. */
export const CHANNELS: Channel[] = [
  { key: "google-profile", name: "Google Maps", api: "/api/google-profile", maxDays: MAX_DAYS, build: (b) => ({
    summary: [block<LocationTotals>("Google Maps · theo cơ sở", [["Cơ sở", (t) => t.name]], [...GMAPS<LocationTotals>(), ["Số ngày có dữ liệu", (t) => t.days]], list(b, "locations"))],
    daily: block<DailyRow>("Google Maps theo ngày", [dayCol(), ["Cơ sở", (d) => d.name]], GMAPS<DailyRow>(), list(b, "daily")) }) },
  { key: "facebook", name: "Facebook", api: "/api/facebook", maxDays: FB_MAX_DAYS, build: (b) => ({
    summary: [block<FbTotals>("Facebook · theo trang", [["Trang", (t) => t.name]], FB, list(b, "pages"))],
    daily: block<FbDaily>("Facebook theo ngày", [dayCol(), ["Trang", (d) => d.name]], FB_DAY, list(b, "daily")) }) },
  { key: "instagram", name: "Instagram", api: "/api/instagram", maxDays: IG_MAX_DAYS, build: (b) => ({
    summary: [block<IgTotals>("Instagram · theo tài khoản", [["Tài khoản", (t) => t.name]], IG, list(b, "accounts"))],
    daily: block<IgDaily>("Instagram theo ngày", [dayCol(), ["Tài khoản", (d) => d.name]], IG_DAY, list(b, "daily")) }) },
  { key: "google-analytics", name: "Google Analytics", api: "/api/google-analytics", maxDays: GA4_MAX_DAYS, build: (b) => ({
    summary: [
      block<Site>("Google Analytics · theo website", [["Website", (t) => t.site]], GA4, list(b, "sites")),
      block<Source>("Google Analytics · theo nguồn", [["Website", (t) => t.site], ["Nguồn", (t) => t.source], ["Phương tiện", (t) => t.medium]], GA4, list(b, "channels"))],
    daily: block<SiteDay>("Google Analytics theo ngày", [dayCol(), ["Website", (d) => d.site]], GA4, list(b, "daily")) }) },
  { key: "tiktok", name: "TikTok", api: "/api/tiktok", maxDays: TT_MAX_DAYS, build: (b) => ({
    summary: [block<TtTotals>("TikTok · theo tài khoản", [["Tài khoản", (t) => t.name]], TT, list(b, "accounts"))],
    daily: block<TtDaily>("TikTok theo ngày", [dayCol(), ["Tài khoản", (d) => d.name]], TT_DAY, list(b, "daily")) }) },
  { key: "facebook-ads", name: "Facebook Ads", api: "/api/facebook-ads", maxDays: ADS_MAX_DAYS, build: (b) => ({
    summary: [block<AdsTotals>("Facebook Ads · theo chiến dịch", [["Chiến dịch", (t) => t.campaign]], ADS, list(b, "campaigns"))],
    daily: block<AdsDaily>("Facebook Ads theo ngày", [dayCol(), ["Chiến dịch", (d) => d.campaign]], ADS_DAY, list(b, "daily")) }) },
  { key: "google-ads", name: "Google Ads", api: "/api/google-ads", maxDays: GADS_MAX_DAYS, build: (b) => ({
    summary: [block<GadsTotals>("Google Ads · theo chiến dịch", [["Chiến dịch", (t) => t.campaign]], GADS, list(b, "campaigns"))],
    daily: block<GadsDaily>("Google Ads theo ngày", [dayCol(), ["Chiến dịch", (d) => d.campaign]], GADS_DAY, list(b, "daily")) }) },
];

/** The longest range every channel can answer; a longer range is still run, the channels that cannot take it say so. */
export const REACH_MAX_DAYS = Math.max(...CHANNELS.map((c) => c.maxDays));
export const spanDays = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
