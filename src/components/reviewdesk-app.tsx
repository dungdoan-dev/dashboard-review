"use client";

import {
  Activity,
  BarChart3,
  ArrowDownToLine,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Compass,
  Database,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  LogOut,
  MapPin,
  Medal,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Star,
  Store,
  Trash2,
  TrendingUp,
  Upload,
  Utensils,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, type MouseEvent as ReactMouseEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { createClient } from "@/lib/supabase/client";
import { getPlatformUrl, DEFAULT_RATING_SCALE, PLATFORM_URL_FIELDS, type PlatformUrlField } from "@/lib/platforms";
import type { HistoricalReportPreview } from "@/lib/historical-report-import";
import TripadvisorRankReportPage, { type TripadvisorRankReportRow } from "@/components/tripadvisor-rank-report-page";
import { PlatformBrandLogo } from "@/components/platform-brand-logo";
import { AutomaticSyncSettings } from "@/components/automatic-sync-settings";
import { DailyComparisonChanges } from "@/components/daily-comparison-changes";
import type {
  LocationInput,
  LocationLinkPlatform,
  LocationRecord,
  LocationType,
  Metric,
  Platform,
  SnapshotInput,
} from "@/lib/types";
import type { User } from "@supabase/supabase-js";

const typeLabels: Record<LocationType, string> = {
  hotel: "Khách sạn",
  cafe: "Cafe",
  mart: "Mart 24h",
  restaurant: "Nhà hàng",
  resort: "Khu nghỉ dưỡng",
  homestay: "Homestay",
  other: "Khác",
};

const platformLabels: Record<Platform, string> = {
  google: "Google Maps",
  tripadvisor: "Tripadvisor",
  agoda: "Agoda",
  booking: "Booking.com",
  tripcom: "Trip.com",
  expedia: "Expedia",
  traveloka: "Traveloka",
  grabfood: "GrabFood",
};

type LocationFilterType = "hotel" | "cafe" | "mart";
const filterTypeOptions: Array<[LocationFilterType, string]> = [["hotel", "Khách sạn"], ["cafe", "Cafe"], ["mart", "Mart 24h"]];
// Nền tảng của từng loại hình; Cafe và Mart 24h dùng chung bộ nguồn.
const typePlatformOrder: Record<LocationFilterType, Platform[]> = {
  hotel: ["google", "booking", "tripadvisor", "tripcom", "agoda", "expedia", "traveloka"],
  cafe: ["google", "tripadvisor", "grabfood"],
  mart: ["google", "tripadvisor", "grabfood"],
};
const allReportPlatforms: Platform[] = [...typePlatformOrder.hotel, "grabfood"];
function filterTypeOf(type: LocationType): LocationFilterType {
  return type === "cafe" || type === "restaurant" ? "cafe" : type === "mart" || type === "other" ? "mart" : "hotel";
}
const reportPlatformColors: Record<Platform, string> = {
  google: "#4285f4",
  tripadvisor: "#168a68",
  agoda: "#7b61c9",
  booking: "#2765cb",
  expedia: "#e7a52a",
  tripcom: "#1494a3",
  traveloka: "#168fd0",
  grabfood: "#00b14f",
};

const demoExpediaUrl = "https://www.expedia.com.vn/Da-Nang-Khach-San-YZISTEL.h113589597.Thong-tin-khach-san?chkin=2025-04-11&chkout=2025-04-13&x_pwa=1&rfrr=HSR&pwa_ts=1743476005040&referrerUrl=aHR0cHM6Ly93d3cuZXhwZWRpYS5jb20udm4vSG90ZWwtU2VhcmNo&useRewards=false&rm1=a2&regionId=6034264&destination=H%E1%BB%99i+An%2C+Qu%E1%BA%A3ng+Nam+%28t%E1%BB%89nh%29%2C+Vi%C3%AA%CC%A3t+Nam&destType=MARKET&neighborhoodId=553248633981701234&selected=113589597&latLong=15.87749%2C108.331009&sort=RECOMMENDED&top_dp=881834&top_cur=VND&userIntent=&selectedRoomType=326233694&selectedRatePlan=400456848&searchId=9b6c19c5-5039-4499-b679-4849b8fd28a4";
const demoLocations: LocationRecord[] = [
  ["Yzistel Hoi An", "Cẩm Phô · Hội An", "hotel", 4.9, 394, 4.9, 77, 9.4, 1021, 9.5, 176, 9.5, 375, "https://maps.app.goo.gl/V87KPGzXLJErD49u5", "https://www.tripadvisor.com.vn/Hotel_Review-g25289644-d33037118-Reviews-Yzistel_Hoi_An-Cam_Pho_Hoi_An_Quang_Nam_Province.html", "https://www.agoda.com/vi-vn/yzistel-hoi-an/hotel/hoi-an-vn.html?countryId=38&finalPriceView=1&isShowMobileAppPrice=false&cid=1844104&numberOfBedrooms=&familyMode=false&adults=2&children=0&rooms=1&maxRooms=0&checkIn=2025-04-10&isCalendarCallout=false&childAges=&numberOfGuest=0&missingChildAges=false&travellerType=1&showReviewSubmissionEntry=false&currencyCode=VND&isFreeOccSearch=false&los=1&searchrequestid=d59ee03e-0852-47a4-acc1-0f561513474f&ds=gxYoCBzO0HpmZ2y6", "https://www.booking.com/hotel/vn/yzistel.vi.html", "https://us.trip.com/hotels/detail/?cityId=1775&hotelId=126921251"],
  ["An Nhiên Riverside Hotel", "Quận 1 · TP. Hồ Chí Minh", "hotel", 4.8, 1284, 4.7, 936, null, null, null, null, null, null, "https://maps.app.goo.gl/zDxVqWAv5WBZvhvp6", "", "", "", ""],
  ["Mộc Nhiên Coffee Thảo Điền", "TP. Thủ Đức · TP. Hồ Chí Minh", "cafe", 4.6, 842, 4.5, 214, null, null, null, null, null, null, "", "", "", "", ""],
  ["An Nhiên Boutique Đà Nẵng", "Sơn Trà · Đà Nẵng", "hotel", 4.7, 1052, 4.8, 768, null, null, null, null, null, null, "", "", "", "", ""],
  ["Mộc Nhiên Coffee Hội An", "Cẩm Châu · Hội An", "cafe", 4.5, 619, 4.6, 401, null, null, null, null, null, null, "", "", "", "", ""],
  ["An Nhiên 24h Nguyễn Trãi", "Quận 5 · TP. Hồ Chí Minh", "mart", 4.3, 386, null, null, null, null, null, null, null, null, "", "", "", "", ""],
  ["An Nhiên Beach Resort", "Mỹ Khê · Đà Nẵng", "hotel", 4.9, 2107, 4.8, 1883, null, null, null, null, null, null, "", "", "", "", ""],
  ["Mộc Nhiên Coffee Bến Thành", "Quận 1 · TP. Hồ Chí Minh", "cafe", 4.4, 472, 4.3, 172, null, null, null, null, null, null, "", "", "", "", ""],
  ["An Nhiên Garden Hotel", "Ninh Kiều · Cần Thơ", "hotel", 4.6, 704, 4.5, 389, null, null, null, null, null, null, "", "", "", "", ""],
  ["Mộc Nhiên Coffee Cần Thơ", "Ninh Kiều · Cần Thơ", "cafe", 4.7, 523, 4.6, 205, null, null, null, null, null, null, "", "", "", "", ""],
  ["An Nhiên Old Quarter Hotel", "Hoàn Kiếm · Hà Nội", "hotel", 4.8, 1014, 4.7, 762, null, null, null, null, null, null, "", "", "", "", ""],
].map(([name, area, type, googleRating, googleCount, tripRating, tripCount, agodaRating, agodaCount, bookingRating, bookingCount, tripcomRating, tripcomCount, gUrl, tUrl, aUrl, bUrl, tcUrl], index) => {
  const capturedAt = `2026-10-12T03:${String(52 - index * 3).padStart(2, "0")}:00.000Z`;
  const metric = (rating: unknown, count: unknown, scale = 5): Metric | null =>
    typeof rating === "number" && typeof count === "number"
      ? { rating, ratingScale: scale, reviewCount: count, countLabel: "đánh giá", capturedAt }
      : null;
  return {
    id: `demo-${index + 1}`,
    name: String(name),
    area: String(area),
    type: type as LocationType,
    googleUrl: String(gUrl ?? ""),
    tripadvisorUrl: String(tUrl ?? ""),
    agodaUrl: String(aUrl ?? ""),
    bookingUrl: String(bUrl ?? ""),
    tripcomUrl: String(tcUrl ?? ""),
    expediaUrl: index === 0 ? demoExpediaUrl : "",
    travelokaUrl: index === 0 ? "https://www.traveloka.com/vi-vn/hotel/detail?spec=05-04-2026.06-04-2026.1.1.HOTEL.9000005722460.Yzistel.2" : "",
    google: metric(googleRating, googleCount, 5),
    tripadvisor: metric(tripRating, tripCount, 5),
    agoda: metric(agodaRating, agodaCount, 10),
    booking: metric(bookingRating, bookingCount, 10),
    tripcom: metric(tripcomRating, tripcomCount, 10),
    expedia: index === 0 ? { rating: 9.8, ratingScale: 10,  reviewCount: 155, countLabel: "nhận xét", capturedAt } : null,
    traveloka: null,
  };
});

type FormDraft = {
  modal: "location" | "snapshot";
  editingId: string | null;
  snapshotPlatform: Platform;
  values: Record<string, string>;
};

type DailyReportSnapshot = {
  id: string | number;
  locationId: string;
  platform: Platform;
  rating: number | null;
  ratingScale: number;
  reviewCount: number | null;
  countLabel: string;
  tripadvisorRank?: string | null;
  tripadvisorNotice?: string | null;
  reportDate: string;
  finalizedAt: string;
};

const formDraftStorageKey = "reviewdesk-open-form-draft";

const moneyless = (value: number) => new Intl.NumberFormat("vi-VN").format(value);
const dateText = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
function reportDateInVietnam() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function withTimeout<T>(request: PromiseLike<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([Promise.resolve(request), timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function parseExpediaMarkdown(markdown: string) {
  const propertyName = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "";
  const ratingText = markdown.match(/(?:^|\n)\s*(\d{1,2}[,.]\d)\s*(?:\d{1,2}[,.]\d\s*)?trên\s*10/i)?.[1];
  const countText = markdown.match(/Xem\s+tất\s+cả\s+([\d.,]+)\s+nhận\s+xét/i)?.[1];
  const rating = ratingText == null ? null : Number(ratingText.replace(",", "."));
  const reviewCount = countText == null ? null : Number(countText.replace(/[.,]/g, ""));
  if (rating == null || !Number.isFinite(rating) || reviewCount == null || !Number.isFinite(reviewCount)) {
    throw new Error("Không nhận diện được điểm / số nhận xét trong file Markdown Expedia.");
  }
  return { propertyName, rating, reviewCount };
}

function metricFromRow(row: Record<string, unknown>): Metric {
  return {
    rating: row.rating_value == null ? null : Number(row.rating_value),
    ratingScale: Number(row.rating_scale ?? 5),
    
    reviewCount: row.review_count == null ? null : Number(row.review_count),
    countLabel: String(row.count_label ?? "đánh giá"),
    capturedAt: String(row.captured_at),
    tripadvisorRank: row.tripadvisor_rank == null ? null : String(row.tripadvisor_rank),
    tripadvisorNotice: row.tripadvisor_notice == null ? null : String(row.tripadvisor_notice),
  };
}

export function ReviewdeskApp({ supabaseConfigured }: { supabaseConfigured: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const isReportPage = pathname === "/report";
  const isDailyAnalyticsPage = pathname === "/reports";
  const isComparePage = pathname === "/compare";
  const isTripadvisorRankPage = pathname === "/tripadvisor-rank";
  const isReportDataPage = isReportPage || isDailyAnalyticsPage || isComparePage || isTripadvisorRankPage;
  const isSettingsPage = pathname === "/settings";
  const needsLiveMetrics = pathname === "/";
  const needsPlatformLinks = needsLiveMetrics || isSettingsPage;
  const [locations, setLocations] = useState<LocationRecord[]>(() => supabaseConfigured ? [] : demoLocations);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [selectedType, setSelectedType] = useState<LocationFilterType>("hotel");
  const reportPlatformOrder = typePlatformOrder[selectedType];
  const [comparisonSelectedIds, setComparisonSelectedIds] = useState<string[] | null>(null);
  const [appliedComparisonIds, setAppliedComparisonIds] = useState<string[] | null>(null);
  const [timelineSnapshots, setTimelineSnapshots] = useState<DailyReportSnapshot[]>([]);
  const timelineCache = useRef(new Map<string, { rows: DailyReportSnapshot[]; loadedAt: number }>());
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState("");
  const [timelineRefresh, setTimelineRefresh] = useState(0);
  const [dailyReportRange, setDailyReportRange] = useState<"all" | "30" | "90" | "365">("30");
  const [compareRange, setCompareRange] = useState<"7" | "30" | "90" | "365" | "all">("7");
  const historyRange = isComparePage ? compareRange : dailyReportRange;
  const [historicalReportPreview, setHistoricalReportPreview] = useState<HistoricalReportPreview | null>(null);
  const [readingHistoricalFile, setReadingHistoricalFile] = useState(false);
  const [importingHistoricalRows, setImportingHistoricalRows] = useState(false);
  const historicalFileInput = useRef<HTMLInputElement>(null);
  const [finalizingPlatform, setFinalizingPlatform] = useState<Platform | null>(null);
  const [finalizingAll, setFinalizingAll] = useState(false);
  const [modal, setModal] = useState<"location" | "snapshot" | null>(null);
  const [snapshotPlatform, setSnapshotPlatform] = useState<Platform>("google");
  const [editing, setEditing] = useState<LocationRecord | null>(null);
  const [grabAccount, setGrabAccount] = useState({ username: "", hasPassword: false });
  const editingId = editing?.id;
  useEffect(() => {
    setGrabAccount({ username: "", hasPassword: false });
    if (modal !== "location" || !editingId || !supabaseConfigured) return;
    void fetch(`/api/grab-account?locationId=${editingId}`).then((res) => (res.ok ? res.json() : null)).then((data) => { if (data) setGrabAccount(data); }).catch(() => {});
  }, [modal, editingId, supabaseConfigured]);
  const [locationFormType, setLocationFormType] = useState<LocationType>("hotel");
  const [saving, setSaving] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [crawlingPlatform, setCrawlingPlatform] = useState<Platform | "all" | null>(null);
  const [crawlingTargetId, setCrawlingTargetId] = useState<string | null>(null);
  const [todayLabel, setTodayLabel] = useState("");
  const [activeSection, setActiveSection] = useState("overview");
  const [formDraft, setFormDraft] = useState<FormDraft | null>(null);
  const [reportScale, setReportScale] = useState<5 | 10>(5);
  const [reportPlatforms, setReportPlatforms] = useState<Platform[]>(allReportPlatforms);
  const [dailyReportPlatformFilter, setDailyReportPlatformFilter] = useState<Platform[] | null>(null);
  const [reportSettingsReady, setReportSettingsReady] = useState(false);
  const reportSettingsKey = `reviewdesk-report-settings-${user?.id ?? "demo"}`;
  const locationSelectionStorageKey = `reviewdesk-selected-location-${user?.id ?? "demo"}`;

  useEffect(() => {
    if (!locations.length) return;
    try {
      const savedLocationId = window.localStorage.getItem(locationSelectionStorageKey);
      const savedLocation = locations.find((location) => location.id === savedLocationId);
      if (savedLocationId === "all-hotels" && isDailyAnalyticsPage && locations.some((location) => location.type === "hotel")) {
        setSelectedLocationId("all-hotels");
        setSelectedType("hotel");
      } else if (savedLocation) {
        setSelectedLocationId((current) => current && locations.some((location) => location.id === current) ? current : savedLocationId!);
      }
    } catch {
      // Keep the default branch selected if browser storage is unavailable.
    }
  }, [locations, locationSelectionStorageKey, isDailyAnalyticsPage]);

  // Giữ bộ lọc loại hình khớp với cơ sở đang chọn (ví dụ khi khôi phục lựa chọn đã lưu).
  useEffect(() => {
    const selected = locations.find((location) => location.id === selectedLocationId);
    if (selected) setSelectedType(filterTypeOf(selected.type));
  }, [locations, selectedLocationId]);

  useEffect(() => {
    if (!selectedLocationId || (selectedLocationId === "all-hotels"
      ? !isDailyAnalyticsPage || !locations.some((location) => location.type === "hotel")
      : !locations.some((location) => location.id === selectedLocationId))) return;
    try {
      window.localStorage.setItem(locationSelectionStorageKey, selectedLocationId);
    } catch {
      // The selected branch remains available for this page session.
    }
  }, [locations, locationSelectionStorageKey, selectedLocationId, isDailyAnalyticsPage]);

  useEffect(() => {
    try {
      const rawDraft = window.sessionStorage.getItem(formDraftStorageKey);
      if (!rawDraft) return;
      const draft = JSON.parse(rawDraft) as FormDraft;
      if ((draft.modal !== "location" && draft.modal !== "snapshot") || !draft.values || typeof draft.values !== "object") return;
      setFormDraft(draft);
      setModal(draft.modal);
      if (draft.modal === "location") setLocationFormType((draft.values.type as LocationType) ?? "hotel");
      setSnapshotPlatform(draft.snapshotPlatform ?? "google");
    } catch {
      try {
        window.sessionStorage.removeItem(formDraftStorageKey);
      } catch {
        // Storage may be unavailable in a restricted browser context.
      }
    }
  }, []);

  useEffect(() => {
    if (!modal || formDraft) return;
    const draft: FormDraft = {
      modal,
      editingId: modal === "location" ? editing?.id ?? null : null,
      snapshotPlatform,
      values: modal === "location" && editing ? {
        name: editing.name,
        area: editing.area,
        type: editing.type,
        googleUrl: editing.googleUrl,
        tripadvisorUrl: editing.tripadvisorUrl,
        agodaUrl: editing.agodaUrl,
        bookingUrl: editing.bookingUrl,
        tripcomUrl: editing.tripcomUrl,
        expediaUrl: editing.expediaUrl ?? "",
        travelokaUrl: editing.travelokaUrl ?? "",
        grabfoodUrl: editing.grabfoodUrl ?? "",
        shopeefoodUrl: editing.shopeefoodUrl ?? "",
      } : {},
    };
    setFormDraft(draft);
    try {
      window.sessionStorage.setItem(formDraftStorageKey, JSON.stringify(draft));
    } catch {
      // Keep the form usable even when session storage is unavailable.
    }
  }, [modal, formDraft, editing?.id, snapshotPlatform]);

  useEffect(() => {
    if (formDraft?.modal !== "location" || !formDraft.editingId) return;
    const savedLocation = locations.find((location) => location.id === formDraft.editingId);
    if (savedLocation) setEditing(savedLocation);
  }, [formDraft, locations]);

  const persistFormElement = useCallback((form: HTMLFormElement, modalKind: FormDraft["modal"]) => {
    const values: Record<string, string> = {};
    for (const element of Array.from(form.elements)) {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) continue;
      if (!element.name || element.type === "password" || element.type === "file") continue;
      values[element.name] = element.value;
    }
    const platformValue = values.platform as Platform | undefined;
    const draft: FormDraft = {
      modal: modalKind,
      editingId: modalKind === "location" ? editing?.id ?? null : null,
      snapshotPlatform: platformValue ?? snapshotPlatform,
      values,
    };
    try {
      window.sessionStorage.setItem(formDraftStorageKey, JSON.stringify(draft));
    } catch {
      // Keep the form usable even when session storage is unavailable.
    }
  }, [editing?.id, snapshotPlatform]);

  function saveFormDraft(event: FormEvent<HTMLFormElement>, modalKind: FormDraft["modal"]) {
    persistFormElement(event.currentTarget, modalKind);
  }

  useEffect(() => {
    if (!modal) return;
    const persistVisibleForm = () => {
      const form = document.querySelector<HTMLFormElement>(`form[data-draft-modal="${modal}"]`);
      if (form) persistFormElement(form, modal);
    };
    const persistWhenHidden = () => {
      if (document.visibilityState === "hidden") persistVisibleForm();
    };
    window.addEventListener("pagehide", persistVisibleForm);
    document.addEventListener("visibilitychange", persistWhenHidden);
    return () => {
      window.removeEventListener("pagehide", persistVisibleForm);
      document.removeEventListener("visibilitychange", persistWhenHidden);
    };
  }, [modal, persistFormElement]);

  function closeModal() {
    try {
      window.sessionStorage.removeItem(formDraftStorageKey);
    } catch {
      // The modal should still close if storage is unavailable.
    }
    setFormDraft(null);
    setModal(null);
    setEditing(null);
  }

  function openLocationModal(location?: LocationRecord) {
    setEditing(location ?? null);
    setLocationFormType(location?.type ?? selectedType);
    setModal("location");
  }

  const loadLocations = useCallback(async () => {
    if (!supabaseConfigured || !user) return;
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const { data: rows, error: locationError } = await withTimeout(
        supabase.from("locations").select("id,name,area,type").order("name"),
        20000,
        "Kết nối Supabase quá thời gian chờ khi tải danh sách cơ sở.",
      );
      if (locationError) {
        setError(`${locationError.message}. Hãy kiểm tra schema Supabase và chính sách RLS.`);
        return;
      }
      const ids = (rows ?? []).map((row) => row.id);
      let snapshots: Record<string, unknown>[] = [];
      let platformLinks: Record<string, unknown>[] = [];
      if (ids.length && (needsLiveMetrics || needsPlatformLinks)) {
        const [{ data: snapshotData, error: snapshotError }, { data: linkData, error: linksError }] = await withTimeout(
          Promise.all([
            needsLiveMetrics ? supabase
              .from("latest_metric_snapshots")
              .select("id,location_id,platform,rating_value,rating_scale,review_count,count_label,tripadvisor_rank,tripadvisor_notice,captured_at")
              .in("location_id", ids) : Promise.resolve({ data: [], error: null }),
            needsPlatformLinks ? supabase.from("location_platforms").select("location_id,platform,url").in("location_id", ids) : Promise.resolve({ data: [], error: null }),
          ]),
          20000,
          "Kết nối Supabase quá thời gian chờ khi tải dữ liệu cơ sở.",
        );
        if (snapshotError) {
          setError(`${snapshotError.message}. Apply supabase/schema.sql.`);
          return;
        }
        if (linksError) {
          setError(`${linksError.message}. Apply the location_platforms migration.`);
          return;
        }
        snapshots = (snapshotData ?? []) as Record<string, unknown>[];
        platformLinks = (linkData ?? []) as Record<string, unknown>[];
      }
      const latest = new Map<string, Record<Platform, Metric | null>>();
      for (const row of snapshots) {
        const current = latest.get(String(row.location_id)) ?? {
          google: null, tripadvisor: null, agoda: null, booking: null, tripcom: null, expedia: null, traveloka: null, grabfood: null,
        };
        const platformName = String(row.platform);
        if (platformName in current) {
          current[platformName as Platform] = metricFromRow(row);
          latest.set(String(row.location_id), current);
        }
      }
      const links = new Map<string, Partial<Record<LocationLinkPlatform, string>>>();
      for (const row of platformLinks) {
        const platformName = String(row.platform) as LocationLinkPlatform;
        if (!(platformName in PLATFORM_URL_FIELDS)) continue;
        const current = links.get(String(row.location_id)) ?? {};
        current[platformName] = String(row.url ?? "");
        links.set(String(row.location_id), current);
      }
      setLocations(
        (rows ?? []).map((row) => {
          const locationLinks = links.get(row.id) ?? {};
          const metrics = latest.get(row.id) ?? {
            google: null, tripadvisor: null, agoda: null, booking: null, tripcom: null, expedia: null, traveloka: null, grabfood: null,
          };
          const urlFields = Object.fromEntries(
            (Object.keys(PLATFORM_URL_FIELDS) as LocationLinkPlatform[]).map((platform) => [
              PLATFORM_URL_FIELDS[platform],
              locationLinks[platform] ?? "",
            ]),
          ) as Pick<LocationInput, PlatformUrlField>;
          return {
            id: row.id,
            name: row.name,
            area: row.area ?? "",
            type: row.type as LocationType,
            ...urlFields,
            ...metrics,
          };
        }),
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [supabaseConfigured, user, needsLiveMetrics, needsPlatformLinks]);

  useEffect(() => {
    if (!supabaseConfigured) {
      return;
    }
    let active = true;
    let unsubscribe = () => {};
    try {
      const supabase = createClient();
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (active) setUser((current) => current?.id === session?.user?.id ? current : session?.user ?? null);
      });
      unsubscribe = () => data.subscription.unsubscribe();
      void withTimeout(
        supabase.auth.getUser(),
        15000,
        "Xác thực Supabase quá thời gian chờ. Kiểm tra kết nối mạng hoặc cấu hình Supabase.",
      )
        .then(({ data: authData, error: authError }) => {
          if (!active) return;
          // Chưa đăng nhập là trạng thái bình thường, không phải lỗi.
          if (authError && authError.name !== "AuthSessionMissingError") setError(authError.message);
          setUser((current) => current?.id === authData.user?.id ? current : authData.user);
        })
        .catch((authError: unknown) => {
          if (!active) return;
          setUser(null);
          setError(authError instanceof Error ? authError.message : String(authError));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    } catch (authError) {
      setUser(null);
      setError(authError instanceof Error ? authError.message : String(authError));
      setLoading(false);
    }
    return () => {
      active = false;
      unsubscribe();
    };
  }, [supabaseConfigured]);

  useEffect(() => {
    if (user) queueMicrotask(() => void loadLocations());
  }, [user, loadLocations]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setTodayLabel(new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date()));
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    setReportSettingsReady(false);
    try {
      const saved = window.localStorage.getItem(reportSettingsKey);
      if (saved) {
        const parsed = JSON.parse(saved) as { scale?: number; platforms?: unknown[] };
        if (parsed.scale === 5 || parsed.scale === 10) setReportScale(parsed.scale);
        if (Array.isArray(parsed.platforms)) {
          const selected = parsed.platforms.filter((platform): platform is Platform =>
            typeof platform === "string" && allReportPlatforms.includes(platform as Platform),
          );
          // Bản lưu cũ (chưa có v) không biết GrabFood: bật mặc định để Cafe có dữ liệu.
          if ((parsed as { v?: number }).v !== 2 && !selected.includes("grabfood")) selected.push("grabfood");
          if (selected.length) setReportPlatforms(selected);
        }
      }
    } catch {
      // Continue with defaults if this browser cannot read saved preferences.
    }
    setReportSettingsReady(true);
  }, [reportSettingsKey]);

  useEffect(() => {
    if (!reportSettingsReady) return;
    try {
      window.localStorage.setItem(reportSettingsKey, JSON.stringify({ v: 2, scale: reportScale, platforms: reportPlatforms }));
    } catch {
      // Keep the current session usable if preferences cannot be saved.
    }
  }, [reportPlatforms, reportScale, reportSettingsKey, reportSettingsReady]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.key === "Escape" && modal) closeModal();
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [modal]);

  const allHotelsSelected = isDailyAnalyticsPage && selectedType === "hotel" && selectedLocationId === "all-hotels";
  const typeLocations = useMemo(() => locations.filter((location) => filterTypeOf(location.type) === selectedType), [locations, selectedType]);
  const hotelLocations = useMemo(() => locations.filter((location) => location.type === "hotel"), [locations]);
  const comparisonLocations = useMemo(() => isComparePage
    ? typeLocations.filter((location) => appliedComparisonIds === null || appliedComparisonIds.includes(location.id))
    : hotelLocations, [isComparePage, typeLocations, appliedComparisonIds, hotelLocations]);
  const draftComparisonLocations = typeLocations.filter((location) => comparisonSelectedIds === null || comparisonSelectedIds.includes(location.id));
  const comparisonMode = allHotelsSelected || isComparePage;
  const dashboardLocation = useMemo(() => typeLocations.find((location) => location.id === selectedLocationId) ?? typeLocations[0] ?? null, [typeLocations, selectedLocationId]);
  const timelineMode = !isReportDataPage ? "hidden" : supabaseConfigured ? "supabase" : "demo";
  const branchLocations = dashboardLocation ? [dashboardLocation] : [];
  const branchFinalizablePlatforms = reportPlatformOrder.filter((platform) => {
    const metric = dashboardLocation?.[platform];
    return metric != null && (metric.rating != null || metric.reviewCount != null);
  });
  function changeLocationType(type: LocationFilterType) {
    setSelectedType(type);
    setSelectedLocationId(locations.find((location) => filterTypeOf(location.type) === type)?.id ?? "");
    setComparisonSelectedIds(null);
    setAppliedComparisonIds(null);
  }

  const isOverviewPage = !isReportDataPage && !isSettingsPage;
  const selectedReportPlatforms = useMemo(() => {
    const chosen = reportPlatformOrder.filter((platform) => (isReportPage || isOverviewPage ? dailyReportPlatformFilter ?? reportPlatforms : reportPlatforms).includes(platform));
    return chosen.length ? chosen : reportPlatformOrder; // loại hình chưa chọn nguồn nào: dùng toàn bộ nguồn của loại đó
  }, [isReportPage, isOverviewPage, dailyReportPlatformFilter, reportPlatforms, reportPlatformOrder]);

  const platformFilter = (
    <fieldset className="analytics-source-filter daily-report-source-filter overview-source-filter"><legend>Nền tảng</legend><div className="analytics-source-options">
      <button type="button" className={`analytics-source-chip ${selectedReportPlatforms.length === reportPlatformOrder.length ? "active" : ""}`} aria-pressed={selectedReportPlatforms.length === reportPlatformOrder.length} onClick={() => setDailyReportPlatformFilter(reportPlatformOrder)}>Tất cả nguồn</button>
      {reportPlatformOrder.map((platform) => <label className={`analytics-source-chip ${selectedReportPlatforms.includes(platform) ? "active" : ""}`} key={platform}>
        <input type="checkbox" checked={selectedReportPlatforms.includes(platform)} onChange={() => setDailyReportPlatformFilter((current) => {
          const selected = current ?? reportPlatforms;
          if (selected.includes(platform)) return selected.length > 1 ? selected.filter((item) => item !== platform) : selected;
          return reportPlatformOrder.filter((item) => selected.includes(item) || item === platform);
        })} /><span className="report-platform-dot" style={{ backgroundColor: reportPlatformColors[platform] }} />{platformLabels[platform]}
      </label>)}
    </div></fieldset>
  );

  const reportData = useMemo(() => {
    const selectedPlatforms = selectedReportPlatforms;
    const reportLocations = dashboardLocation ? [dashboardLocation] : [];
    const locationRows = reportLocations.map((location) => {
      const platformMetrics = selectedPlatforms.map((platform) => {
        const metric = location[platform];
        return {
          platform,
          metric,
          normalizedScore: metric?.rating != null && metric.ratingScale > 0
            ? (metric.rating / metric.ratingScale) * reportScale
            : null,
        };
      });
      const metrics = platformMetrics.flatMap(({ metric }) => metric ? [metric] : []);
      return {
        location,
        platformMetrics,
        reviewTotal: metrics.reduce((sum, metric) => sum + (metric.reviewCount ?? 0), 0),
        hasRating: platformMetrics.some(({ metric }) => metric?.rating != null),
        hasData: metrics.length > 0,
      };
    });
    const reviewTotal = locationRows.reduce((sum, row) => sum + row.reviewTotal, 0);
    const locationCoverage = locationRows.filter((row) => row.hasData).length;
    const ratedLocationCount = locationRows.filter((row) => row.hasRating).length;
    const ratedScores = locationRows.flatMap((row) => row.platformMetrics.flatMap(({ normalizedScore }) => normalizedScore == null ? [] : [normalizedScore]));
    const averageScore = ratedScores.length ? ratedScores.reduce((sum, score) => sum + score, 0) / ratedScores.length : null;
    const captureTimes = locationRows.flatMap((row) => row.platformMetrics.flatMap(({ metric }) => metric?.capturedAt ? [metric.capturedAt] : [])).sort();
    const latestCapture = captureTimes[captureTimes.length - 1] ?? null;
    const platformCoverage = selectedPlatforms.filter((platform) =>
      dashboardLocation?.[platform] != null,
    ).length;
    return {
      selectedPlatforms,
      locationRows,
      reviewTotal,
      ratedLocationCount,
      averageScore,
      latestCapture,
      platformCoverage,
      locationCoverage,
    };
  }, [dashboardLocation, selectedReportPlatforms, reportScale]);

  useEffect(() => {
    if (timelineMode === "hidden") {
      setTimelineLoading(false);
      return;
    }
    if (timelineMode === "demo") {
      setTimelineLoading(false);
      setTimelineError("");
      return;
    }
    if (!user || (comparisonMode ? comparisonLocations.length === 0 : !dashboardLocation)) {
      setTimelineSnapshots([]);
      setTimelineLoading(false);
      setTimelineError("");
      return;
    }
    let active = true;
    const scopeIds = (comparisonMode ? comparisonLocations.map((location) => location.id) : [dashboardLocation!.id]).sort();
    const cacheKey = JSON.stringify([user.id, scopeIds, historyRange, timelineRefresh]);
    const cachedResult = timelineCache.current.get(cacheKey);
    if (cachedResult && Date.now() - cachedResult.loadedAt < 60_000) {
      setTimelineSnapshots(cachedResult.rows);
      setTimelineLoading(false);
      setTimelineError("");
      return;
    }
    timelineCache.current.delete(cacheKey);
    setTimelineLoading(true);
    setTimelineError("");
    void (async () => {
      const rows: Record<string, unknown>[] = [];
      const pageSize = 1000;
      const supabase = createClient();
      const locationIds = scopeIds;
      let startDate: string | null = null;
      if (historyRange !== "all") {
        const firstDay = new Date(`${reportDateInVietnam()}T00:00:00Z`);
        firstDay.setUTCDate(firstDay.getUTCDate() - Number(historyRange) + 1);
        startDate = firstDay.toISOString().slice(0, 10);
      }
      for (let offset = 0; active; offset += pageSize) {
        let baseQuery = supabase
          .from("daily_report_snapshots")
          .select("id,location_id,platform,rating_value,rating_scale,review_count,count_label,tripadvisor_rank,tripadvisor_notice,report_date,finalized_at")
          .order("report_date", { ascending: false })
          .order("id", { ascending: false });
        if (startDate) baseQuery = baseQuery.gte("report_date", startDate);
        const query = comparisonMode
          ? baseQuery.in("location_id", locationIds)
          : baseQuery.eq("location_id", dashboardLocation!.id);
        const { data, error: historyError } = await query.range(offset, offset + pageSize - 1);
        if (historyError) throw historyError;
        rows.push(...((data ?? []) as Record<string, unknown>[]));
        if (!data || data.length < pageSize) break;
      }
      if (!active) return;
      const snapshots = rows.map((row) => ({
          id: String(row.id ?? `${row.location_id}-${row.platform}-${row.report_date}`),
          locationId: String(row.location_id),
          platform: String(row.platform) as Platform,
          rating: row.rating_value == null ? null : Number(row.rating_value),
          ratingScale: Number(row.rating_scale ?? 5),
          reviewCount: row.review_count == null ? null : Number(row.review_count),
          countLabel: String(row.count_label ?? "đánh giá"),
          tripadvisorRank: row.tripadvisor_rank == null ? null : String(row.tripadvisor_rank),
          tripadvisorNotice: row.tripadvisor_notice == null ? null : String(row.tripadvisor_notice),
          reportDate: String(row.report_date),
          finalizedAt: String(row.finalized_at),
      }));
      timelineCache.current.set(cacheKey, { rows: snapshots, loadedAt: Date.now() });
      if (timelineCache.current.size > 8) timelineCache.current.delete(timelineCache.current.keys().next().value!);
      setTimelineSnapshots(snapshots);
    })().catch((historyError: unknown) => {
      if (!active) return;
      setTimelineSnapshots([]);
      setTimelineError(historyError instanceof Error ? historyError.message : String(historyError));
    }).finally(() => {
      if (active) setTimelineLoading(false);
    });
    return () => { active = false; };
  }, [timelineMode, user, dashboardLocation, comparisonMode, comparisonLocations, historyRange, timelineRefresh]);

  const timelineRows = useMemo(() => {
    const grouped = new Map<string, Partial<Record<Platform, DailyReportSnapshot>>>();
    for (const snapshot of timelineSnapshots) {
      if (snapshot.locationId !== dashboardLocation?.id) continue;
      if (isTripadvisorRankPage ? snapshot.platform !== "tripadvisor" : !selectedReportPlatforms.includes(snapshot.platform)) continue;
      const dateKey = snapshot.reportDate;
      const day = grouped.get(dateKey) ?? {};
      const current = day[snapshot.platform];
      if (!current || current.finalizedAt < snapshot.finalizedAt) day[snapshot.platform] = snapshot;
      grouped.set(dateKey, day);
    }
    return Array.from(grouped, ([date, metrics]) => ({ date, metrics })).sort((left, right) => left.date.localeCompare(right.date));
  }, [timelineSnapshots, dashboardLocation?.id, isTripadvisorRankPage, selectedReportPlatforms]);

  const dailyAnalyticsRows = useMemo(() => {
    if (!timelineRows.length || dailyReportRange === "all") return timelineRows;
    const latestDate = new Date(`${timelineRows[timelineRows.length - 1].date}T00:00:00Z`);
    latestDate.setUTCDate(latestDate.getUTCDate() - Number(dailyReportRange) + 1);
    const startDate = latestDate.toISOString().slice(0, 10);
    return timelineRows.filter((row) => row.date >= startDate);
  }, [timelineRows, dailyReportRange]);

  const hotelComparisonData = useMemo(() => {
    if (!comparisonMode) return { scoreRows: [], reviewRows: [] };
    const comparisonIds = new Set(comparisonLocations.map((location) => location.id));
    const grouped = new Map<string, Map<string, DailyReportSnapshot[]>>();
    for (const snapshot of timelineSnapshots) {
      if (!comparisonIds.has(snapshot.locationId) || !selectedReportPlatforms.includes(snapshot.platform)) continue;
      const byHotel = grouped.get(snapshot.reportDate) ?? new Map<string, DailyReportSnapshot[]>();
      byHotel.set(snapshot.locationId, [...(byHotel.get(snapshot.locationId) ?? []), snapshot]);
      grouped.set(snapshot.reportDate, byHotel);
    }
    const dates = [...grouped.keys()].sort();
    const latestDate = dates.at(-1);
    const startDate = latestDate && historyRange !== "all"
      ? new Date(`${latestDate}T00:00:00Z`) : null;
    if (startDate) startDate.setUTCDate(startDate.getUTCDate() - Number(historyRange) + 1);
    const scoreRows: Record<string, string | number | null>[] = [];
    const reviewRows: Record<string, string | number | null>[] = [];
    for (const date of dates.filter((date) => !startDate || date >= startDate.toISOString().slice(0, 10))) {
      const scoreRow: Record<string, string | number | null> = { date };
      const reviewRow: Record<string, string | number | null> = { date };
      for (const location of comparisonLocations) {
        const metrics = grouped.get(date)?.get(location.id) ?? [];
        const scores = metrics.flatMap((metric) => metric.rating == null || metric.ratingScale <= 0 ? [] : [metric.rating / metric.ratingScale * reportScale]);
        const counts = metrics.flatMap((metric) => metric.reviewCount == null ? [] : [metric.reviewCount]);
        scoreRow[location.id] = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
        reviewRow[location.id] = counts.length ? counts.reduce((sum, count) => sum + count, 0) : null;
      }
      if (comparisonLocations.some((location) => scoreRow[location.id] != null)) scoreRows.push(scoreRow);
      if (comparisonLocations.some((location) => reviewRow[location.id] != null)) reviewRows.push(reviewRow);
    }
    return { scoreRows, reviewRows };
  }, [comparisonMode, comparisonLocations, timelineSnapshots, selectedReportPlatforms, reportScale, historyRange]);

  const tripadvisorRankRows = useMemo<TripadvisorRankReportRow[]>(() => dailyAnalyticsRows.flatMap((row) => {
    const metric = row.metrics.tripadvisor;
    if (!metric?.tripadvisorRank && !metric?.tripadvisorNotice) return [];
    const rankLabel = metric.tripadvisorRank ?? "";
    const match = rankLabel.match(/Số\s*#?\s*([\d.,]+)\s+(?:trên|trong)\s+([\d.,]+)(?:\s+(.+))?/i)
      ?? rankLabel.match(/#?([\d.,]+)\s*\/\s*([\d.,]+)(?:\s+(.+))?/i);
    const position = match ? Number(match[1].replace(/[.,]/g, "")) : null;
    const total = match ? Number(match[2].replace(/[.,]/g, "")) : null;
    return [{
      date: row.date,
      rankLabel,
      tripadvisorNotice: metric.tripadvisorNotice ?? null,
      position: position != null && Number.isFinite(position) ? position : null,
      total: total != null && Number.isFinite(total) ? total : null,
      category: match?.[3]?.trim() ?? null,
      rating: metric.rating,
      ratingScale: metric.ratingScale,
      reviewCount: metric.reviewCount,
    }];
  }), [dailyAnalyticsRows]);

  const dailyAnalyticsPlatforms = useMemo(() => selectedReportPlatforms.filter((platform) =>
    dailyAnalyticsRows.some((row) => row.metrics[platform] != null),
  ), [dailyAnalyticsRows, selectedReportPlatforms]);

  const dailyAnalyticsScoreDomain = useMemo(() => {
    const scores = dailyAnalyticsRows.flatMap((row) => dailyAnalyticsPlatforms.flatMap((platform) => {
      const metric = row.metrics[platform];
      return metric?.rating == null || !metric.ratingScale ? [] : [metric.rating / metric.ratingScale * reportScale];
    }));
    if (!scores.length) return { min: 0, max: reportScale };
    const observedMin = Math.min(...scores);
    const observedMax = Math.max(...scores);
    const padding = Math.max(0.15, (observedMax - observedMin) * 0.18);
    let min = Math.max(0, Math.floor((observedMin - padding) * 10) / 10);
    let max = Math.min(reportScale, Math.ceil((observedMax + padding) * 10) / 10);
    if (max - min < 0.4) {
      min = Math.max(0, max - 0.4);
      max = Math.min(reportScale, min + 0.4);
    }
    return { min, max };
  }, [dailyAnalyticsRows, dailyAnalyticsPlatforms, reportScale]);

  const dailyAnalyticsChartData = useMemo(() => dailyAnalyticsRows.map((row) => {
    const chartRow: Record<string, string | number | null> = { date: row.date };
    dailyAnalyticsPlatforms.forEach((platform) => {
      const metric = row.metrics[platform];
      chartRow[platform] = metric?.rating == null || !metric.ratingScale
        ? null
        : metric.rating / metric.ratingScale * reportScale;
    });
    return chartRow;
  }), [dailyAnalyticsRows, dailyAnalyticsPlatforms, reportScale]);

  const dailyAnalyticsReviewChartData = useMemo(() => dailyAnalyticsRows.map((row) => {
    const chartRow: Record<string, string | number | null> = { date: row.date };
    dailyAnalyticsPlatforms.forEach((platform) => {
      chartRow[platform] = row.metrics[platform]?.reviewCount ?? null;
    });
    return chartRow;
  }), [dailyAnalyticsRows, dailyAnalyticsPlatforms]);

  const historicalReportSummary = useMemo(() => {
    if (!historicalReportPreview) return null;
    const dates = historicalReportPreview.rows.map((row) => row.reportDate).sort();
    return {
      firstDate: dates[0],
      lastDate: dates[dates.length - 1],
      platforms: new Set(historicalReportPreview.rows.map((row) => row.platform)).size,
      ratings: historicalReportPreview.rows.filter((row) => row.rating != null).length,
      reviewCounts: historicalReportPreview.rows.filter((row) => row.reviewCount != null).length,
      unmappedBranches: historicalReportPreview.branches.filter((branch) => !branch.locationId),
    };
  }, [historicalReportPreview]);

  async function readHistoricalReportFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("Chọn file Excel .xlsx để nhập báo cáo lịch sử.");
      return;
    }

    setReadingHistoricalFile(true);
    setError("");
    setNotice("");
    try {
      const { parseHistoricalReportWorkbook } = await import("@/lib/historical-report-import");
      const preview = parseHistoricalReportWorkbook(await file.arrayBuffer(), file.name, locations);
      setHistoricalReportPreview(preview);
      setNotice(`Đã đọc ${preview.rows.length.toLocaleString("vi-VN")} dòng dữ liệu từ sheet ${preview.sheetName}.`);
    } catch (importError) {
      setHistoricalReportPreview(null);
      setError(importError instanceof Error ? importError.message : String(importError));
    } finally {
      setReadingHistoricalFile(false);
    }
  }

  async function importHistoricalReportRows() {
    if (!historicalReportPreview || importingHistoricalRows) return;
    if (!supabaseConfigured || !user) {
      setError("Đăng nhập và kết nối Supabase để nhập dữ liệu lịch sử.");
      return;
    }

    const locationBySourceName = new Map(historicalReportPreview.branches.map((branch) => [branch.sourceName, branch.locationId]));
    const unmapped = historicalReportPreview.branches.filter((branch) => !branch.locationId);
    if (unmapped.length) {
      setError(`Hãy chọn cơ sở tương ứng cho: ${unmapped.map((branch) => branch.sourceName).join(", ")}.`);
      return;
    }

    const finalizedAt = new Date().toISOString();
    const payload = historicalReportPreview.rows.map((row) => ({
      location_id: locationBySourceName.get(row.sourceLocationName)!,
      platform: row.platform,
      report_date: row.reportDate,
      rating_scale: DEFAULT_RATING_SCALE[row.platform],
      rating_value: row.rating,
      review_count: row.reviewCount,
      count_label: row.platform === "expedia" ? "nhận xét" : "đánh giá",
      finalized_at: finalizedAt,
      finalized_by: user.id,
    }));

    setImportingHistoricalRows(true);
    setError("");
    setNotice("");
    try {
      const { error: importError } = await createClient()
        .from("daily_report_snapshots")
        .upsert(payload, { onConflict: "location_id,platform,report_date" });
      if (importError) throw importError;

      setTimelineRefresh((value) => value + 1);
      setNotice(`Đã nhập ${payload.length.toLocaleString("vi-VN")} snapshot lịch sử từ ${historicalReportPreview.fileName}.`);
      setHistoricalReportPreview(null);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : String(importError));
    } finally {
      setImportingHistoricalRows(false);
    }
  }

  async function saveLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input: LocationInput = {
      name: String(form.get("name") ?? "").trim(),
      area: String(form.get("area") ?? "").trim(),
      type: String(form.get("type") ?? "hotel") as LocationType,
      googleUrl: String(form.get("googleUrl") ?? "").trim(),
      tripadvisorUrl: String(form.get("tripadvisorUrl") ?? "").trim(),
      agodaUrl: String(form.get("agodaUrl") ?? "").trim(),
      bookingUrl: String(form.get("bookingUrl") ?? "").trim(),
      tripcomUrl: String(form.get("tripcomUrl") ?? "").trim(),
      expediaUrl: String(form.get("expediaUrl") ?? "").trim(),
      travelokaUrl: String(form.get("travelokaUrl") ?? "").trim(),
      grabfoodUrl: String(form.get("grabfoodUrl") ?? "").trim(),
      shopeefoodUrl: String(form.get("shopeefoodUrl") ?? "").trim(),
    };
    if (!input.name) return setError("Vui lòng nhập tên cơ sở.");
    setSaving(true);
    setError("");
    if (!supabaseConfigured) {
      if (editing) setLocations((items) => items.map((item) => item.id === editing.id ? { ...item, ...input } : item));
      else setLocations((items) => [{ id: crypto.randomUUID(), ...input, google: null, tripadvisor: null, agoda: null, booking: null, tripcom: null, expedia: null, traveloka: null, grabfood: null }, ...items]);
      setNotice(editing ? "Đã cập nhật cơ sở trong bản demo." : "Đã thêm cơ sở trong bản demo.");
    } else {
      const supabase = createClient();
      const payload = { name: input.name, area: input.area, type: input.type };
      const result = editing
        ? await supabase.from("locations").update(payload).eq("id", editing.id).select("id").single()
        : await supabase.from("locations").insert(payload).select("id").single();
      if (result.error || !result.data) {
        setError(result.error?.message ?? "Could not retrieve the saved location ID.");
        setSaving(false);
        return;
      }
      const platformLinks = (Object.keys(PLATFORM_URL_FIELDS) as LocationLinkPlatform[])
        .map((platform) => ({ platform, url: input[PLATFORM_URL_FIELDS[platform]]?.trim() ?? "" }))
        .filter((item) => item.url.length > 0);
      const { error: linksError } = await supabase.rpc("replace_location_platforms", {
        p_location_id: result.data.id,
        p_platforms: platformLinks,
      });
      if (linksError) {
        setError(`Location saved, but platform links could not be saved: ${linksError.message}`);
        setSaving(false);
        return;
      }
      if (filterTypeOf(input.type) !== "hotel" || grabAccount.username) {
        const grabResponse = await fetch("/api/grab-account", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locationId: result.data.id, username: String(form.get("grabUser") ?? ""), password: String(form.get("grabPassword") ?? "") }),
        }).catch(() => null);
        if (!grabResponse?.ok) {
          setError(`Đã lưu cơ sở nhưng chưa lưu được tài khoản Grab: ${(await grabResponse?.json().catch(() => null))?.message ?? "lỗi mạng"}`);
          setSaving(false);
          await loadLocations();
          return;
        }
      }
      closeModal();
      setEditing(null);
      setNotice(editing ? "Đã cập nhật cơ sở." : "Đã thêm cơ sở.");
      setSaving(false);
      await loadLocations();
      return;
    }
    closeModal();
    setSaving(false);
  }

  async function deleteLocation(location: LocationRecord) {
    if (!window.confirm(`Xóa ${location.name} và toàn bộ snapshot của cơ sở này?`)) return;
    if (!supabaseConfigured) {
      setLocations((items) => items.filter((item) => item.id !== location.id));
      setNotice("Đã xóa cơ sở khỏi bản demo.");
      return;
    }
    const { error: deleteError } = await createClient().from("locations").delete().eq("id", location.id);
    if (deleteError) setError(deleteError.message);
    else {
      setNotice("Đã xóa cơ sở.");
      await loadLocations();
    }
  }

  async function saveSnapshot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const platformVal = String(form.get("platform")) as Platform;
    const ratingScale = DEFAULT_RATING_SCALE[platformVal];
    const input: SnapshotInput = {
      locationId: String(form.get("locationId")),
      platform: platformVal,
      rating: form.get("rating") === "" ? null : Number(form.get("rating")),
      ratingScale,
      
      reviewCount: form.get("reviewCount") === "" ? null : Number(form.get("reviewCount")),
      countLabel: String(form.get("countLabel") || "đánh giá").trim(),
    };
    const source = String(form.get("source") || "manual");
    if (input.rating == null && input.reviewCount == null) {
      setError("Nhập ít nhất điểm đánh giá hoặc số lượng đánh giá.");
      return;
    }
    if (input.rating != null && (input.rating < 0 || input.rating > ratingScale)) {
      setError(`Điểm đánh giá phải nằm trong khoảng 0–${ratingScale}.`);
      return;
    }
    if (input.reviewCount != null && input.reviewCount < 0) {
      setError("Số lượng đánh giá không thể âm.");
      return;
    }
    const capturedAt = new Date().toISOString();
    const metric: Metric = { rating: input.rating, ratingScale, reviewCount: input.reviewCount, countLabel: input.countLabel, capturedAt };
    setSaving(true);
    setError("");
    if (!supabaseConfigured) {
      setLocations((items) => items.map((item) => item.id !== input.locationId ? item : { ...item, [input.platform]: metric }));
      setNotice("Đã ghi snapshot trong bản demo.");
    } else {
      const { error: insertError } = await createClient().from("metric_snapshots").insert({
        location_id: input.locationId,
        platform: input.platform,
        rating_value: input.rating,
        rating_scale: input.ratingScale,
        
        review_count: input.reviewCount,
        count_label: input.countLabel,
        source,
        captured_at: capturedAt,
      });
      if (insertError) setError(insertError.message);
      else {
        closeModal();
        setNotice("Đã ghi snapshot số liệu.");
        setSaving(false);
        await loadLocations();
        return;
      }
      if (insertError) {
        setSaving(false);
        return;
      }
    }
    closeModal();
    setSaving(false);
  }

  async function finalizeDailySnapshot(platform: Platform) {
    if (!dashboardLocation || finalizingAll || crawling) return;
    const metric = dashboardLocation[platform] ?? null;
    if (!metric || (metric.rating == null && metric.reviewCount == null)) {
      setError(`Chưa có snapshot ${platformLabels[platform]} để chốt cho ${dashboardLocation.name}.`);
      return;
    }
    const reportDate = reportDateInVietnam();
    const finalizedAt = new Date().toISOString();
    setFinalizingPlatform(platform);
    setError("");
    setNotice("");
    try {
      if (supabaseConfigured && user) {
        const { error: finalizeError } = await createClient().from("daily_report_snapshots").upsert({
          location_id: dashboardLocation.id,
          platform,
          report_date: reportDate,
          rating_value: metric.rating,
          rating_scale: metric.ratingScale,
          review_count: metric.reviewCount,
          count_label: metric.countLabel,
          tripadvisor_rank: platform === "tripadvisor" ? metric.tripadvisorRank ?? null : null,
          tripadvisor_notice: platform === "tripadvisor" ? metric.tripadvisorNotice ?? null : null,
          finalized_at: finalizedAt,
          finalized_by: user.id,
        }, { onConflict: "location_id,platform,report_date" });
        if (finalizeError) throw finalizeError;
        setTimelineRefresh((value) => value + 1);
      } else {
        const snapshot: DailyReportSnapshot = {
          id: `local-${dashboardLocation.id}-${platform}-${reportDate}`,
          locationId: dashboardLocation.id,
          platform,
          rating: metric.rating,
          ratingScale: metric.ratingScale,
          reviewCount: metric.reviewCount,
          countLabel: metric.countLabel,
          tripadvisorRank: platform === "tripadvisor" ? metric.tripadvisorRank ?? null : null,
          tripadvisorNotice: platform === "tripadvisor" ? metric.tripadvisorNotice ?? null : null,
          reportDate,
          finalizedAt,
        };
        setTimelineSnapshots((items) => [...items.filter((item) => !(item.locationId === snapshot.locationId && item.platform === platform && item.reportDate === reportDate)), snapshot]);
      }
      setNotice(`Đã chốt ${platformLabels[platform]} cho ${dashboardLocation.name} ngày ${new Date(`${reportDate}T12:00:00Z`).toLocaleDateString("vi-VN", { timeZone: "UTC" })}.`);
    } catch (finalizeError) {
      setError(finalizeError instanceof Error ? finalizeError.message : String(finalizeError));
    } finally {
      setFinalizingPlatform(null);
    }
  }

  async function finalizeBranchToday() {
    if (!dashboardLocation || finalizingPlatform || finalizingAll || crawling) return;
    if (!branchFinalizablePlatforms.length) {
      setError(`Chưa có snapshot nào để chốt cho ${dashboardLocation.name}.`);
      return;
    }
    const reportDate = reportDateInVietnam();
    const finalizedAt = new Date().toISOString();
    const reportRows: DailyReportSnapshot[] = branchFinalizablePlatforms.flatMap((platform) => {
      const metric = dashboardLocation[platform];
      if (!metric || (metric.rating == null && metric.reviewCount == null)) return [];
      return [{
        id: `local-${dashboardLocation.id}-${platform}-${reportDate}`,
        locationId: dashboardLocation.id,
        platform,
        rating: metric.rating,
        ratingScale: metric.ratingScale,
        reviewCount: metric.reviewCount,
        countLabel: metric.countLabel,
        tripadvisorRank: platform === "tripadvisor" ? metric.tripadvisorRank ?? null : null,
        tripadvisorNotice: platform === "tripadvisor" ? metric.tripadvisorNotice ?? null : null,
        reportDate,
        finalizedAt,
      }];
    });
    setFinalizingAll(true);
    setError("");
    setNotice("");
    try {
      if (supabaseConfigured && user) {
        const { error: finalizeError } = await createClient().from("daily_report_snapshots").upsert(
          reportRows.map((row) => ({
            location_id: row.locationId,
            platform: row.platform,
            report_date: row.reportDate,
            rating_value: row.rating,
            rating_scale: row.ratingScale,
            review_count: row.reviewCount,
            count_label: row.countLabel,
            tripadvisor_rank: row.platform === "tripadvisor" ? row.tripadvisorRank ?? null : null,
            tripadvisor_notice: row.platform === "tripadvisor" ? row.tripadvisorNotice ?? null : null,
            finalized_at: row.finalizedAt,
            finalized_by: user.id,
          })),
          { onConflict: "location_id,platform,report_date" },
        );
        if (finalizeError) throw finalizeError;
        setTimelineRefresh((value) => value + 1);
      } else {
        const reportKeys = new Set(reportRows.map((row) => `${row.locationId}:${row.platform}:${row.reportDate}`));
        setTimelineSnapshots((items) => [...items.filter((item) => !reportKeys.has(`${item.locationId}:${item.platform}:${item.reportDate}`)), ...reportRows]);
      }
      setNotice(`Đã chốt ${reportRows.length} nền tảng cho ${dashboardLocation.name} ngày ${new Date(`${reportDate}T12:00:00Z`).toLocaleDateString("vi-VN", { timeZone: "UTC" })}.`);
    } catch (finalizeError) {
      setError(finalizeError instanceof Error ? finalizeError.message : String(finalizeError));
    } finally {
      setFinalizingAll(false);
    }
  }

  async function triggerCrawl(
    platform: Platform | "all" = "all",
    targetLocationId?: string,
    endpoint = "/api/crawl",
  ) {
    if (crawling) return;
    setError("");
    setNotice("");

    const googleTargetsToCrawl = (
      targetLocationId ? locations.filter((l) => l.id === targetLocationId) : locations
    )
      .filter((l) => l.googleUrl && l.googleUrl.trim().startsWith("https://"))
      .map((l) => ({ id: l.id, name: l.name, googleUrl: l.googleUrl }));

    const tripTargetsToCrawl = (
      targetLocationId ? locations.filter((l) => l.id === targetLocationId) : locations
    )
      .filter((l) => l.tripadvisorUrl && l.tripadvisorUrl.trim().startsWith("https://"))
      .map((l) => ({ id: l.id, name: l.name, tripadvisorUrl: l.tripadvisorUrl }));

    const agodaTargetsToCrawl = (
      targetLocationId ? locations.filter((l) => l.id === targetLocationId) : locations
    )
      .filter((l) => l.agodaUrl && l.agodaUrl.trim().startsWith("https://"))
      .map((l) => ({ id: l.id, name: l.name, agodaUrl: l.agodaUrl }));

    const bookingTargetsToCrawl = (
      targetLocationId ? locations.filter((l) => l.id === targetLocationId) : locations
    )
      .filter((l) => l.bookingUrl && l.bookingUrl.trim().startsWith("https://"))
      .map((l) => ({ id: l.id, name: l.name, bookingUrl: l.bookingUrl }));

    const tripcomTargetsToCrawl = (
      targetLocationId ? locations.filter((l) => l.id === targetLocationId) : locations
    )
      .filter((l) => l.tripcomUrl && l.tripcomUrl.trim().startsWith("https://"))
      .map((l) => ({ id: l.id, name: l.name, tripcomUrl: l.tripcomUrl }));

    const expediaTargetsToCrawl = (
      targetLocationId ? locations.filter((l) => l.id === targetLocationId) : locations
    )
      .filter((l) => l.expediaUrl && l.expediaUrl.trim().startsWith("https://"))
      .map((l) => ({ id: l.id, name: l.name, expediaUrl: l.expediaUrl ?? "" }));

    const travelokaTargetsToCrawl = (
      targetLocationId ? locations.filter((l) => l.id === targetLocationId) : locations
    )
      .filter((l) => l.travelokaUrl && l.travelokaUrl.trim().startsWith("https://"))
      .map((l) => ({ id: l.id, name: l.name, travelokaUrl: l.travelokaUrl ?? "" }));

    const grabfoodTargetsToCrawl = (
      targetLocationId ? locations.filter((l) => l.id === targetLocationId) : locations
    )
      .filter((l) => filterTypeOf(l.type) !== "hotel")
      .map((l) => ({ id: l.id, name: l.name }));

    if (platform === "google" && googleTargetsToCrawl.length === 0) {
      setError(
        targetLocationId
          ? "Cơ sở này chưa có liên kết Google Maps hợp lệ."
          : "Chưa có cơ sở nào có liên kết Google Maps.",
      );
      return;
    }

    if (platform === "tripadvisor" && tripTargetsToCrawl.length === 0) {
      setError(
        targetLocationId
          ? "Cơ sở này chưa có liên kết TripAdvisor hợp lệ."
          : "Chưa có cơ sở nào có liên kết TripAdvisor.",
      );
      return;
    }

    if (platform === "agoda" && agodaTargetsToCrawl.length === 0) {
      setError(
        targetLocationId
          ? "Cơ sở này chưa có liên kết Agoda hợp lệ."
          : "Chưa có cơ sở nào có liên kết Agoda.",
      );
      return;
    }

    if (platform === "booking" && bookingTargetsToCrawl.length === 0) {
      setError(
        targetLocationId
          ? "Cơ sở này chưa có liên kết Booking.com hợp lệ."
          : "Chưa có cơ sở nào có liên kết Booking.com.",
      );
      return;
    }

    if (platform === "tripcom" && tripcomTargetsToCrawl.length === 0) {
      setError(
        targetLocationId
          ? "Cơ sở này chưa có liên kết Trip.com hợp lệ."
          : "Chưa có cơ sở nào có liên kết Trip.com.",
      );
      return;
    }

    if (platform === "expedia" && expediaTargetsToCrawl.length === 0) {
      setError(targetLocationId ? "Cơ sở này chưa có liên kết Expedia hợp lệ." : "Chưa có cơ sở nào có liên kết Expedia.");
      return;
    }

    if (platform === "traveloka" && travelokaTargetsToCrawl.length === 0) {
      setError(targetLocationId ? "Cơ sở này chưa có liên kết Traveloka hợp lệ." : "Chưa có cơ sở nào có liên kết Traveloka.");
      return;
    }

    if (platform === "grabfood" && grabfoodTargetsToCrawl.length === 0) {
      setError(targetLocationId ? "Chỉ cơ sở Cafe và Mart 24h mới lấy được dữ liệu GrabFood." : "Chưa có cơ sở Cafe hoặc Mart 24h nào.");
      return;
    }

    if (
      platform === "all" &&
      googleTargetsToCrawl.length === 0 &&
      tripTargetsToCrawl.length === 0 &&
      agodaTargetsToCrawl.length === 0 &&
      bookingTargetsToCrawl.length === 0 &&
      tripcomTargetsToCrawl.length === 0 &&
      expediaTargetsToCrawl.length === 0 &&
      travelokaTargetsToCrawl.length === 0 &&
      grabfoodTargetsToCrawl.length === 0
    ) {
      setError("Chưa có cơ sở nào có liên kết để cào dữ liệu.");
      return;
    }

    setCrawling(true);
    setCrawlingPlatform(platform);
    setCrawlingTargetId(targetLocationId || null);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          locationId: targetLocationId,
          googleTargets: googleTargetsToCrawl,
          tripTargets: tripTargetsToCrawl,
          agodaTargets: agodaTargetsToCrawl,
          bookingTargets: bookingTargetsToCrawl,
          tripcomTargets: tripcomTargetsToCrawl,
          expediaTargets: expediaTargetsToCrawl,
          travelokaTargets: travelokaTargetsToCrawl,
          headless: true,
        }),
      });

      const data = await res.json();

      if (supabaseConfigured && user) {
        await loadLocations();
      } else if (Array.isArray(data.results)) {
        setLocations((prev) => {
          const updated = [...prev];
          for (const item of data.results) {
            if (item.ratingValue == null && item.count == null) continue;
            const idx = updated.findIndex((l) => l.id === item.id);
            if (idx === -1) continue;

            const metricScale =
              ["agoda", "booking", "tripcom", "expedia", "traveloka"].includes(item.platform)
                ? 10
                : 5;
            const metric: Metric = {
              rating: item.ratingValue,
              ratingScale: metricScale,
              
              reviewCount: item.count,
              countLabel: item.platform === "expedia" ? "nhận xét" : "đánh giá",
              capturedAt: item.capturedAt,
              ...(item.platform === "tripadvisor" ? { tripadvisorRank: item.rankLabel ?? null, tripadvisorNotice: item.tripadvisorNotice ?? null } : {}),
            };

            if (item.platform === "google") {
              updated[idx] = { ...updated[idx], google: metric };
            } else if (item.platform === "tripadvisor") {
              updated[idx] = { ...updated[idx], tripadvisor: metric };
            } else if (item.platform === "agoda") {
              updated[idx] = { ...updated[idx], agoda: metric };
            } else if (item.platform === "booking") {
              updated[idx] = { ...updated[idx], booking: metric };
            } else if (item.platform === "tripcom") {
              updated[idx] = { ...updated[idx], tripcom: metric };
            } else if (item.platform === "expedia") {
              updated[idx] = { ...updated[idx], expedia: metric };
            } else if (item.platform === "traveloka") {
              updated[idx] = { ...updated[idx], traveloka: metric };
            } else if (item.platform === "grabfood") {
              updated[idx] = { ...updated[idx], grabfood: metric };
            }
          }
          return updated;
        });
      }

      if (!res.ok || data.success === false) {
        setError(data.message || data.error || "Crawl hoàn tất nhưng có nền tảng chưa lấy được dữ liệu.");
      } else {
        setNotice(data.message || `Đã cào dữ liệu thành công cho ${data.successCount ?? 0} liên kết!`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setCrawling(false);
      setCrawlingPlatform(null);
      setCrawlingTargetId(null);
    }
  }

  function exportCsv() {
    const cell = (value: unknown) => {
      const text = String(value ?? "");
      const safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const rows: unknown[][] = [["Cơ sở", "Khu vực", "Loại hình", "Nền tảng", "Điểm sao", "Thang điểm", "Số lượng", "Nhãn số lượng", "Thời điểm lấy"]];
    for (const location of locations) {
      for (const [platform, label] of [
        ["google", "Google Maps"],
        ["tripadvisor", "Tripadvisor"],
        ["agoda", "Agoda"],
        ["booking", "Booking.com"],
        ["tripcom", "Trip.com"],
        ["expedia", "Expedia"],
        ["traveloka", "Traveloka"],
        ["grabfood", "GrabFood"],
      ] as const) {
        const metric = location[platform];
        if (metric) rows.push([location.name, location.area, typeLabels[location.type], label, metric.rating ?? "", metric.ratingScale,  metric.reviewCount ?? "", metric.countLabel, metric.capturedAt]);
      }
    }
    const blob = new Blob(["\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "reviewdesk-metrics.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function navigateWithinDashboard(event: ReactMouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>('a[href^="#"]');
    if (!link) return;
    const sectionId = decodeURIComponent(link.getAttribute("href")!.slice(1));
    if (sectionId === "settings" || sectionId === "settings-locations") {
      event.preventDefault();
      router.push(sectionId === "settings" ? "/settings" : "/settings#settings-locations");
      return;
    }
    if ((isReportPage || isSettingsPage) && sectionId !== "daily-reports") {
      event.preventDefault();
      router.push(sectionId === "overview" ? "/" : `/#${encodeURIComponent(sectionId)}`);
      return;
    }
    const section = document.getElementById(sectionId);
    if (!section) return;

    event.preventDefault();
    window.history.replaceState(null, "", `#${encodeURIComponent(sectionId)}`);
    setActiveSection(sectionId);
    requestAnimationFrame(() => document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function logout() {
    if (supabaseConfigured) await createClient().auth.signOut();
    closeModal();
    setUser(null);
    setLocations([]);
  }

  const locationFormValues = formDraft?.modal === "location" ? formDraft.values : {};
  const snapshotFormValues = formDraft?.modal === "snapshot" ? formDraft.values : {};

  if (supabaseConfigured && (loading || (!user && loading))) {
    return <div className="center-state"><LoaderCircle className="spin" size={22} /><span>Đang kết nối không gian làm việc…</span></div>;
  }

  if (supabaseConfigured && !user) {
    return <AuthScreen error={error} onClearError={() => setError("")} />;
  }

  return (
    <div className="app-shell" onClick={navigateWithinDashboard}>
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Reviewdesk, về tổng quan">
          <span className="brand-mark"><Activity size={19} strokeWidth={2.4} /></span>
          <span>reviewdesk<span className="brand-period">.</span></span>
        </Link>
        <div className="workspace-card">
          <div className="workspace-avatar">{user?.email?.slice(0, 1).toUpperCase() || "RD"}</div>
          <div className="workspace-info"><strong>{user ? user.email?.split("@")[0] : "Không gian demo"}</strong><span>{user ? "Workspace cá nhân" : "Dữ liệu minh họa"}</span></div>
          <ChevronDown size={15} />
        </div>
        <nav className="side-nav" aria-label="Điều hướng chính">
          <span className="nav-label">KHÔNG GIAN LÀM VIỆC</span>
          <Link className={`nav-link ${!isReportDataPage && !isSettingsPage && activeSection === "overview" ? "active" : ""}`} href="/"><LayoutDashboard size={17} /><span>Tổng quan</span></Link>
          <Link className={`nav-link ${isReportPage ? "active" : ""}`} href="/report"><CalendarDays size={17} /><span>Dashboard theo ngày</span></Link>
          <Link className={`nav-link ${isDailyAnalyticsPage ? "active" : ""}`} href="/reports"><BarChart3 size={17} /><span>Báo cáo theo ngày</span></Link>
          <Link className={`nav-link ${isComparePage ? "active" : ""}`} href="/compare"><TrendingUp size={17} /><span>So sánh báo cáo</span></Link>
          <Link className={`nav-link ${isTripadvisorRankPage ? "active" : ""}`} href="/tripadvisor-rank"><Medal size={17} /><span>Xếp hạng Tripadvisor</span></Link>
          <span className="nav-label nav-label-spaced">CÔNG CỤ</span>
          <button className="nav-link" type="button" onClick={exportCsv}><ArrowDownToLine size={17} /><span>Xuất dữ liệu</span></button>
          <Link className={`nav-link ${isSettingsPage ? "active" : ""}`} href="/settings"><Settings2 size={17} /><span>Cài đặt</span></Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="plan-card"><div className="plan-icon"><ShieldCheck size={16} /></div><strong>Dữ liệu của bạn luôn riêng tư</strong><p>Mỗi tài khoản chỉ xem và quản lý cơ sở của mình.</p><a href="#security">Tìm hiểu về bảo mật <ArrowUpRight size={13} /></a></div>
          <button className="profile-row" type="button" onClick={() => { if (supabaseConfigured) void logout(); }} disabled={!supabaseConfigured} aria-label={supabaseConfigured ? "Đăng xuất" : "Chế độ xem demo"}><span className="profile-avatar">{user?.email?.slice(0, 1).toUpperCase() || "D"}</span><span className="profile-meta"><strong>{user?.email || "Chế độ demo"}</strong><small>{supabaseConfigured ? "Tài khoản Supabase" : "Chưa kết nối Supabase"}</small></span>{supabaseConfigured ? <LogOut size={16} /> : <CircleHelp size={16} />}</button>
        </div>
      </aside>

      <main className="main-area" id="overview">
        <header className="dashboard-topbar">
          <div className="topbar-title"><span className="topbar-overline">{isComparePage ? "SO SÁNH BÁO CÁO" : isTripadvisorRankPage ? "XẾP HẠNG TRIPADVISOR" : isDailyAnalyticsPage ? "BÁO CÁO THEO NGÀY" : isReportPage ? "DASHBOARD THEO NGÀY" : isSettingsPage ? "CẤU HÌNH WORKSPACE" : "DASHBOARD OVERVIEW"}</span><strong>{isComparePage ? `${comparisonLocations.length} cơ sở đang so sánh` : isSettingsPage ? "Cài đặt" : allHotelsSelected ? "Tất cả khách sạn" : dashboardLocation?.name ?? "Chọn cơ sở"}</strong></div>
          {!isComparePage && <><label className="location-picker type-picker"><Store size={17} /><span>Loại hình</span><select aria-label="Chọn loại hình" value={selectedType} onChange={(event) => changeLocationType(event.target.value as LocationFilterType)}>{filterTypeOptions.map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select><ChevronDown size={15} /></label><label className="location-picker"><Building2 size={17} /><span>Cơ sở đang xem</span><select aria-label="Chọn cơ sở để xem báo cáo" value={allHotelsSelected ? "all-hotels" : dashboardLocation?.id ?? ""} onChange={(event) => setSelectedLocationId(event.target.value)}><option value="" disabled>{typeLocations.length ? "Chọn cơ sở" : "Chưa có cơ sở loại này"}</option>{isDailyAnalyticsPage && selectedType === "hotel" && hotelLocations.length > 0 && <option value="all-hotels">Tất cả khách sạn</option>}{typeLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select><ChevronDown size={15} /></label></>}
          <div className="date-chip topbar-date"><Clock3 size={15} />{todayLabel || "Hôm nay"}</div>
        </header>
        <div className={`content-wrap ${isReportPage ? "daily-reports-active" : ""} ${isDailyAnalyticsPage ? "daily-analytics-active" : ""} ${isComparePage ? "compare-reports-active" : ""} ${isTripadvisorRankPage ? "tripadvisor-rank-active" : ""} ${isSettingsPage ? "settings-page-active" : ""}`}>
          {!supabaseConfigured && <div className="demo-banner"><span className="demo-spark"><Database size={16} /></span><div><strong>Đang xem dữ liệu mẫu</strong><span>Kết nối Supabase để lưu dữ liệu riêng cho tài khoản của bạn.</span></div><a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">Cách kết nối <ArrowUpRight size={14} /></a></div>}
          {error && <div className="alert alert-error" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Đóng thông báo"><X size={16} /></button></div>}
          {notice && <div className="alert alert-success" role="status"><Check size={16} /><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Đóng thông báo"><X size={16} /></button></div>}

          {isSettingsPage && <section className="settings-page-heading"><div className="section-kicker"><Settings2 size={14} /> CÀI ĐẶT</div><h1>Cấu hình workspace</h1><p>Quản lý cách tính báo cáo và thông tin liên kết của từng cơ sở.</p></section>}

          {!isReportDataPage && !isSettingsPage && <>
          <section className="page-heading overview-hero"><div className="overview-hero-copy"><div className="eyebrow"><Compass size={14} /> THEO DÕI DANH TIẾNG</div><h1>{dashboardLocation?.name ?? "Chưa có cơ sở"}</h1><p>{dashboardLocation ? `${dashboardLocation.area || "Chưa có khu vực"} · ${typeLabels[dashboardLocation.type]}` : "Thêm cơ sở để bắt đầu theo dõi đánh giá."}</p></div><button className="button button-outline dashboard-add-location" onClick={() => openLocationModal()}><Plus size={15} />Thêm cơ sở</button></section>

          <section className="stats-grid overview-stats" aria-label="Chỉ số tổng quan">
            <StatCard icon={<Star size={18} />} label="Điểm trung bình các kênh" value={reportData.averageScore == null ? "—" : reportData.averageScore.toFixed(1).replace(".", ",")} suffix={`/ ${reportScale}`} meta={dashboardLocation ? `Chuẩn hóa trên ${dashboardLocation.name}` : "Chưa có dữ liệu điểm"} tone="blue" />
            <StatCard icon={<TrendingUp size={18} />} label="Tổng lượt đánh giá" value={moneyless(reportData.reviewTotal)} meta="Cộng snapshot mới nhất trên các kênh đã chọn" tone="green" />
            <StatCard icon={<Link2 size={18} />} label="Kênh có dữ liệu" value={`${reportData.platformCoverage}`} suffix={`/ ${reportData.selectedPlatforms.length}`} meta="Các nền tảng có snapshot hiện tại" tone="violet" />
            <StatCard icon={<Clock3 size={18} />} label="Cập nhật gần nhất" value={reportData.latestCapture ? dateText.format(new Date(reportData.latestCapture)) : "—"} meta={dashboardLocation?.name ?? "Chưa chọn cơ sở"} tone="amber" />
          </section>



          {platformFilter}

          <section className="report-dashboard" aria-labelledby="report-dashboard-title">
            <header className="report-dashboard-head">
              <div><div className="section-kicker"><span className="live-mark" /> HIỆU SUẤT THEO NỀN TẢNG</div><h2 id="report-dashboard-title">Kênh đánh giá · {dashboardLocation?.name ?? "Chưa chọn cơ sở"}</h2><p>Điểm quy đổi về thang {reportScale} và lượt đánh giá mới nhất của cơ sở đang xem.</p></div>
              <div className="report-dashboard-actions">
                <button className="button button-primary" onClick={() => dashboardLocation && triggerCrawl("all", dashboardLocation.id, "/api/crawl/bulk")} disabled={crawling || !dashboardLocation}>
                  {crawling && crawlingPlatform === "all" ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}
                  {crawling && crawlingPlatform === "all" ? "Đang cập nhật cơ sở…" : "Cập nhật cơ sở này"}
                </button>
                <button className="button button-outline finalize-button" onClick={() => void finalizeBranchToday()} disabled={!dashboardLocation || !branchFinalizablePlatforms.length || finalizingAll || finalizingPlatform !== null || crawling} title="Chốt dữ liệu của tất cả nền tảng đang có số liệu cho cơ sở này">
                  {finalizingAll ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}
                  {finalizingAll ? "Đang chốt cơ sở…" : "Chốt hôm nay cho cơ sở"}
                </button>
                <Link className="button button-outline report-settings-link" href="/settings"><Settings2 size={15} />Cấu hình báo cáo</Link>
              </div>
            </header>
            {reportData.locationRows[0] ? <div className="report-dashboard-grid">
              <article className="report-card chart-card">
                <header><div><h3>Điểm theo nền tảng</h3><p>Điểm hiện tại quy đổi về thang {reportScale}</p></div><span className="report-scale-badge">{dashboardLocation?.name}</span></header>
                <div className="report-rows">
                  {reportData.locationRows[0].platformMetrics.map(({ platform, metric, normalizedScore }) => <div className="report-score-row" key={platform}>
                    <div className="report-row-label"><span className="report-platform-dot" style={{ backgroundColor: reportPlatformColors[platform] }} />{platformLabels[platform]}</div>
                    <div className="report-track"><span style={{ width: `${Math.max(0, Math.min(100, ((normalizedScore ?? 0) / reportScale) * 100))}%`, backgroundColor: reportPlatformColors[platform] }} /></div>
                    <strong>{normalizedScore == null ? "—" : `${normalizedScore.toFixed(1).replace(".", ",")} / ${reportScale}`}</strong>
                    <small>Gốc: {metric?.rating == null ? "Chưa có điểm" : `${metric.rating.toFixed(1).replace(".", ",")} / ${metric.ratingScale}`}</small>
                  </div>)}
                  {reportData.selectedPlatforms.length === 0 && <p className="report-empty">Chọn ít nhất một nền tảng trong cấu hình báo cáo.</p>}
                </div>
                <p className="report-footnote">Điểm quy đổi giúp so sánh các nền tảng có thang điểm khác nhau.</p>
              </article>
              <article className="report-card chart-card">
                <header><div><h3>Lượt đánh giá theo nền tảng</h3><p>Số liệu snapshot mới nhất của cơ sở</p></div><span className="report-total-badge">{moneyless(reportData.reviewTotal)}</span></header>
                <div className="report-rows">
                  {reportData.locationRows[0].platformMetrics.map(({ platform, metric }) => <div className="report-volume-row" key={platform}>
                    <div className="report-volume-label"><span><span className="report-platform-dot" style={{ backgroundColor: reportPlatformColors[platform] }} />{platformLabels[platform]}</span><strong>{metric?.reviewCount == null ? "—" : moneyless(metric.reviewCount)}</strong></div>
                    <div className="report-track"><span style={{ width: `${Math.max(0, Math.min(100, ((metric?.reviewCount ?? 0) / Math.max(1, ...reportData.locationRows[0].platformMetrics.map((item) => item.metric?.reviewCount ?? 0))) * 100))}%`, backgroundColor: reportPlatformColors[platform] }} /></div>
                  </div>)}
                  {reportData.selectedPlatforms.length === 0 && <p className="report-empty">Chọn ít nhất một nền tảng trong cấu hình báo cáo.</p>}
                </div>
                <p className="report-footnote">Tổng lượt là phép cộng các kênh đã chọn; một khách hàng có thể xuất hiện trên nhiều nền tảng.</p>
              </article>
            </div> : <article className="report-card report-empty-dashboard"><p className="report-empty">Chưa có cơ sở để lập báo cáo. Hãy thêm cơ sở và chọn cơ sở cần xem.</p></article>}
          </section>
          </>}

          {isReportPage && <section className="timeline-section daily-report-page" id="daily-reports" aria-labelledby="timeline-title">
            <header className="timeline-heading">
              <div><div className="section-kicker"><span className="live-mark" /> BÁO CÁO ĐÃ CHỐT</div><h2 id="timeline-title">Báo cáo theo ngày</h2><p>Số điểm và lượt đánh giá đã chốt, lưu riêng theo từng chi nhánh.</p></div>
              <div className="daily-report-controls">
                <label className="daily-report-location-picker"><Building2 size={15} /><span>Chi nhánh</span><select aria-label="Chọn chi nhánh để xem báo cáo" value={dashboardLocation?.id ?? ""} onChange={(event) => setSelectedLocationId(event.target.value)}><option value="" disabled>Chọn chi nhánh</option>{typeLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select><ChevronDown size={14} /></label>
                <label className="daily-report-location-picker"><CalendarDays size={15} /><span>Thời gian</span><select aria-label="Chọn khoảng thời gian dữ liệu đã chốt" value={dailyReportRange} onChange={(event) => setDailyReportRange(event.target.value as typeof dailyReportRange)}><option value="30">30 ngày</option><option value="90">90 ngày</option><option value="365">365 ngày</option><option value="all">Toàn bộ</option></select><ChevronDown size={14} /></label>
                <span className="timeline-count">{timelineRows.length} ngày đã chốt</span>
                <label className="button button-outline report-import-trigger">
                  {readingHistoricalFile ? <LoaderCircle size={15} className="spin" /> : <Upload size={15} />}
                  {readingHistoricalFile ? "Đang đọc file…" : "Nhập dữ liệu cũ"}
                  <input className="sr-only" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={readHistoricalReportFile} aria-label="Chọn file Excel báo cáo cũ" />
                </label>
              </div>
            </header>
            {platformFilter}
            {historicalReportPreview && historicalReportSummary && <section className="historical-import-preview" aria-labelledby="historical-import-title">
              <header className="historical-import-heading">
                <div><div className="section-kicker"><Upload size={14} /> XEM TRƯỚC DỮ LIỆU</div><h3 id="historical-import-title">{historicalReportPreview.fileName}</h3><p>Sheet “{historicalReportPreview.sheetName}” · {historicalReportPreview.rows.length.toLocaleString("vi-VN")} snapshot</p></div>
                <button className="icon-button" type="button" onClick={() => setHistoricalReportPreview(null)} aria-label="Hủy xem trước file nhập"><X size={17} /></button>
              </header>
              <div className="historical-import-summary">
                <div><span>Khoảng ngày</span><strong>{historicalReportSummary.firstDate && new Date(`${historicalReportSummary.firstDate}T12:00:00Z`).toLocaleDateString("vi-VN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })} – {historicalReportSummary.lastDate && new Date(`${historicalReportSummary.lastDate}T12:00:00Z`).toLocaleDateString("vi-VN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}</strong></div>
                <div><span>Chi nhánh</span><strong>{historicalReportPreview.branches.length}</strong></div>
                <div><span>Nền tảng</span><strong>{historicalReportSummary.platforms}</strong></div>
                <div><span>Điểm sao đọc được</span><strong>{historicalReportSummary.ratings.toLocaleString("vi-VN")}</strong></div>
                <div><span>Lượt đánh giá đọc được</span><strong>{historicalReportSummary.reviewCounts.toLocaleString("vi-VN")}</strong></div>
              </div>
              <div className="historical-import-mappings">
                <div className="historical-import-label"><strong>Ghép tên chi nhánh trong file với hệ thống</strong><span>Kiểm tra từng dòng trước khi nhập.</span></div>
                {historicalReportPreview.branches.map((branch) => <label className="historical-import-mapping" key={branch.sourceName}><span>{branch.sourceName}</span><select value={branch.locationId ?? ""} onChange={(event) => setHistoricalReportPreview((current) => current ? { ...current, branches: current.branches.map((item) => item.sourceName === branch.sourceName ? { ...item, locationId: event.target.value || null } : item) } : current)}><option value="">Chọn cơ sở…</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>)}
              </div>
              <div className="historical-import-notes">
                <p>Cùng ngày, cơ sở và nền tảng sẽ cập nhật bản ghi đã có. Cột xếp hạng không được nhập.</p>
                {historicalReportPreview.skippedCells > 0 && <p>Đã bỏ qua {historicalReportPreview.skippedCells} ô dữ liệu trống hoặc không hợp lệ.</p>}
                {historicalReportPreview.warnings.map((warning) => <p key={warning}>{warning}</p>)}
              </div>
              <footer className="historical-import-actions">
                <button className="button button-outline" type="button" onClick={() => setHistoricalReportPreview(null)} disabled={importingHistoricalRows}>Hủy</button>
                <button className="button button-primary" type="button" onClick={() => void importHistoricalReportRows()} disabled={importingHistoricalRows || readingHistoricalFile || historicalReportSummary.unmappedBranches.length > 0 || !supabaseConfigured || !user}>
                  {importingHistoricalRows ? <LoaderCircle size={15} className="spin" /> : <Upload size={15} />}
                  {importingHistoricalRows ? "Đang nhập…" : `Nhập ${historicalReportPreview.rows.length.toLocaleString("vi-VN")} snapshot`}
                </button>
              </footer>
            </section>}
            <div className="timeline-panel">
              {timelineLoading ? <div className="timeline-empty"><LoaderCircle size={17} className="spin" />Đang tải lịch sử snapshot…</div>
                : timelineError ? <div className="timeline-empty timeline-error">Không tải được lịch sử: {timelineError}</div>
                  : timelineRows.length === 0 ? <div className="timeline-empty"><Clock3 size={18} /><div><strong>Chưa có dữ liệu báo cáo đã chốt</strong><span>Chốt dữ liệu hôm nay ở trang tổng quan để bắt đầu lịch sử cho {dashboardLocation?.name ?? "chi nhánh này"}.</span></div></div>
                    : <div className="timeline-table-scroll"><table className="timeline-table"><thead>
                      <tr><th className="timeline-date">NGÀY</th>{selectedReportPlatforms.map((platform) => <th key={platform}>{platformLabels[platform]}</th>)}</tr>
                    </thead><tbody>
                      {timelineRows.map((row) => <tr key={row.date}>
                        <th className="timeline-date-value"><time dateTime={row.date}>{new Date(`${row.date}T12:00:00Z`).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })}</time><small className="timeline-date-coverage">Đã chốt {selectedReportPlatforms.filter((platform) => row.metrics[platform]).length}/{selectedReportPlatforms.length} nguồn</small></th>
                        {selectedReportPlatforms.map((platform) => {
                          const metric = row.metrics[platform];
                          const normalizedScore = metric?.rating == null ? null : (metric.rating / metric.ratingScale) * reportScale;
                          return <td className="timeline-metric-cell" key={`${row.date}-${platform}`}>
                            {!metric ? <span className="timeline-no-data">Chưa chốt</span> : <>
                              <div className="timeline-normalized"><strong>{normalizedScore == null ? "—" : normalizedScore.toFixed(1).replace(".", ",")}</strong><span>/{reportScale} chuẩn hóa</span></div>
                              <div className="timeline-raw">Điểm gốc <strong>{metric.rating == null ? "—" : `${metric.rating.toFixed(1).replace(".", ",")} / ${metric.ratingScale}`}</strong></div>
                              {platform === "tripadvisor" && metric.tripadvisorRank && <div className="tripadvisor-rank-label">{metric.tripadvisorRank}</div>}
                              <div className="timeline-review-count"><strong>{metric.reviewCount == null ? "—" : moneyless(metric.reviewCount)}</strong><span>lượt đánh giá</span></div>
                            </>}
                          </td>;
                        })}
                      </tr>)}
                    </tbody></table></div>}
              {timelineRows.length > 0 && <footer className="timeline-footer">Đang xem {dashboardLocation?.name} · {timelineRows.length} ngày đã chốt</footer>}
            </div>
          </section>}

          {isDailyAnalyticsPage && <section className="daily-analytics-page" aria-labelledby="daily-analytics-title">
            <header className="daily-analytics-heading">
              <div><div className="section-kicker"><BarChart3 size={14} /> SỐ LIỆU ĐÃ CHỐT</div><h1 id="daily-analytics-title">Báo cáo theo ngày</h1><p>Xu hướng điểm sao và lượt đánh giá từ dữ liệu đã chốt của {allHotelsSelected ? "tất cả khách sạn" : dashboardLocation?.name ?? "chi nhánh đang chọn"}.</p></div>
              <label className="analytics-range-picker"><CalendarDays size={15} /><span>Khoảng thời gian</span><select value={dailyReportRange} onChange={(event) => setDailyReportRange(event.target.value as typeof dailyReportRange)} aria-label="Chọn khoảng thời gian báo cáo"><option value="all">Toàn bộ dữ liệu</option><option value="30">30 ngày gần nhất</option><option value="90">90 ngày gần nhất</option><option value="365">365 ngày gần nhất</option></select></label>
            </header>
            <fieldset className="analytics-source-filter">
              <legend>Nguồn đánh giá</legend>
              <div className="analytics-source-options">
                <button type="button" className={`analytics-source-chip ${reportPlatforms.length === reportPlatformOrder.length ? "active" : ""}`} aria-pressed={reportPlatforms.length === reportPlatformOrder.length} onClick={() => setReportPlatforms(reportPlatformOrder)}>Tất cả nguồn</button>
                {reportPlatformOrder.map((platform) => <label className={`analytics-source-chip ${reportPlatforms.includes(platform) ? "active" : ""}`} key={platform}>
                  <input type="checkbox" checked={reportPlatforms.includes(platform)} onChange={() => setReportPlatforms((current) => current.includes(platform) ? current.length > 1 ? current.filter((item) => item !== platform) : current : reportPlatformOrder.filter((item) => current.includes(item) || item === platform))} />
                  <span className="report-platform-dot" style={{ backgroundColor: reportPlatformColors[platform] }} />{platformLabels[platform]}
                </label>)}
              </div>
            </fieldset>
            {timelineLoading ? <div className="timeline-panel timeline-empty"><LoaderCircle size={17} className="spin" />Đang tải dữ liệu đã chốt…</div>
              : timelineError ? <div className="timeline-panel timeline-empty timeline-error">Không tải được dữ liệu đã chốt: {timelineError}</div>
                : allHotelsSelected ? hotelComparisonData.scoreRows.length === 0 && hotelComparisonData.reviewRows.length === 0 ? <div className="timeline-panel timeline-empty"><Clock3 size={18} />Chưa có dữ liệu đã chốt cho các khách sạn trong khoảng ngày này.</div> : <>
                  {hotelComparisonData.scoreRows.length > 0 && <article className="report-card analytics-chart-card hotel-comparison-card">
                    <header><div><h3>So sánh điểm giữa các khách sạn</h3><p>Mỗi cột là điểm trung bình của các nền tảng đã chọn, quy đổi về thang {reportScale}. Ngày thiếu dữ liệu được để trống.</p></div><span className="report-total-badge">{hotelComparisonData.scoreRows.length} ngày · {hotelLocations.length} khách sạn</span></header>
                    <div className="hotel-comparison-scroll"><div style={{ minWidth: Math.max(680, hotelComparisonData.scoreRows.length * Math.max(70, hotelLocations.length * 24)) }}>
                      <ResponsiveContainer width="100%" height={390}>
                        <BarChart data={hotelComparisonData.scoreRows} margin={{ top: 12, right: 20, bottom: 8, left: 8 }} barGap={2}>
                          <CartesianGrid stroke="#e8edf5" strokeDasharray="3 5" vertical={false} />
                          <XAxis dataKey="date" tickFormatter={(value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "UTC" })} tick={{ fill: "#71819a", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#dfe6f0" }} />
                          <YAxis domain={[0, reportScale]} tick={{ fill: "#71819a", fontSize: 11 }} tickLine={false} axisLine={false} width={38} />
                          <Tooltip labelFormatter={(value) => new Date(`${String(value)}T12:00:00Z`).toLocaleDateString("vi-VN", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" })} formatter={(value, name) => [typeof value === "number" ? `${value.toFixed(1).replace(".", ",")} / ${reportScale}` : "—", String(name)]} contentStyle={{ border: "1px solid #dfe6f0", borderRadius: 10, fontSize: 12 }} />
                          <Legend verticalAlign="bottom" height={40} iconType="square" wrapperStyle={{ fontSize: 11 }} />
                          {hotelLocations.map((location, index) => <Bar key={location.id} dataKey={location.id} name={location.name} fill={["#3568c8", "#d88a3d", "#22a28d", "#8b63c7", "#c75c73", "#5b8e46"][index % 6]} maxBarSize={32} isAnimationActive={false} />)}
                        </BarChart>
                      </ResponsiveContainer>
                    </div></div>
                  </article>}
                  {hotelComparisonData.reviewRows.length > 0 && <article className="report-card analytics-chart-card hotel-comparison-card">
                    <header><div><h3>So sánh lượt đánh giá giữa các khách sạn</h3><p>Tổng lượt đánh giá đã chốt từ các nền tảng đang chọn cho từng khách sạn, theo ngày. Ngày thiếu dữ liệu được để trống.</p></div><span className="report-total-badge">{hotelComparisonData.reviewRows.length} ngày · {hotelLocations.length} khách sạn</span></header>
                    <div className="hotel-comparison-scroll"><div style={{ minWidth: Math.max(680, hotelComparisonData.reviewRows.length * Math.max(70, hotelLocations.length * 24)) }}>
                      <ResponsiveContainer width="100%" height={390}>
                        <BarChart data={hotelComparisonData.reviewRows} margin={{ top: 12, right: 20, bottom: 8, left: 8 }} barGap={2}>
                          <CartesianGrid stroke="#e8edf5" strokeDasharray="3 5" vertical={false} />
                          <XAxis dataKey="date" tickFormatter={(value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "UTC" })} tick={{ fill: "#71819a", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#dfe6f0" }} />
                          <YAxis domain={[0, "auto"]} allowDecimals={false} tickFormatter={(value: number) => moneyless(value)} tick={{ fill: "#71819a", fontSize: 11 }} tickLine={false} axisLine={false} width={58} />
                          <Tooltip labelFormatter={(value) => new Date(`${String(value)}T12:00:00Z`).toLocaleDateString("vi-VN", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" })} formatter={(value, name) => [typeof value === "number" ? `${moneyless(value)} lượt đánh giá` : "—", String(name)]} contentStyle={{ border: "1px solid #dfe6f0", borderRadius: 10, fontSize: 12 }} />
                          <Legend verticalAlign="bottom" height={40} iconType="square" wrapperStyle={{ fontSize: 11 }} />
                          {hotelLocations.map((location, index) => <Bar key={location.id} dataKey={location.id} name={location.name} fill={["#3568c8", "#d88a3d", "#22a28d", "#8b63c7", "#c75c73", "#5b8e46"][index % 6]} maxBarSize={32} isAnimationActive={false} />)}
                        </BarChart>
                      </ResponsiveContainer>
                    </div></div>
                  </article>}
                </>
                : dailyAnalyticsRows.length === 0 ? <div className="timeline-panel timeline-empty"><Clock3 size={18} /><div><strong>Chưa có dữ liệu đã chốt</strong><span>Chốt dữ liệu hôm nay từ trang tổng quan, sau đó báo cáo sẽ xuất hiện tại đây.</span></div></div>
                  : <>
                    <div className="analytics-summary-grid">
                      <article className="analytics-summary-card"><span>Ngày có số liệu đã chốt</span><strong>{dailyAnalyticsRows.length.toLocaleString("vi-VN")}</strong><small>{new Date(`${dailyAnalyticsRows[0].date}T12:00:00Z`).toLocaleDateString("vi-VN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })} – {new Date(`${dailyAnalyticsRows[dailyAnalyticsRows.length - 1].date}T12:00:00Z`).toLocaleDateString("vi-VN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}</small></article>
                      <article className="analytics-summary-card"><span>Nền tảng có dữ liệu</span><strong>{dailyAnalyticsPlatforms.length}</strong><small>Trong {selectedReportPlatforms.length} nền tảng được chọn</small></article>
                      <article className="analytics-summary-card"><span>Lần chốt gần nhất</span><strong>{new Date(`${dailyAnalyticsRows[dailyAnalyticsRows.length - 1].date}T12:00:00Z`).toLocaleDateString("vi-VN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}</strong><small>{dashboardLocation?.name}</small></article>
                    </div>
                    <div className="analytics-platform-grid">
                      {dailyAnalyticsPlatforms.map((platform) => {
                        const recent = [...dailyAnalyticsRows].reverse().find((row) => row.metrics[platform]);
                        const metric = recent?.metrics[platform];
                        const score = metric?.rating == null ? null : (metric.rating / metric.ratingScale) * reportScale;
                        return <article className="analytics-platform-card" key={platform}>
                          <header><span className="report-platform-dot" style={{ backgroundColor: reportPlatformColors[platform] }} /><strong>{platformLabels[platform]}</strong></header>
                          <div className="analytics-platform-values"><div><span>Điểm chuẩn hóa</span><strong>{score == null ? "—" : `${score.toFixed(1).replace(".", ",")} / ${reportScale}`}</strong></div><div><span>Lượt đánh giá</span><strong>{metric?.reviewCount == null ? "—" : moneyless(metric.reviewCount)}</strong></div></div>
                          <footer>Chốt ngày {recent?.date ? new Date(`${recent.date}T12:00:00Z`).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }) : "—"}{metric?.rating != null ? ` · gốc ${metric.rating.toFixed(1).replace(".", ",")}/${metric.ratingScale}` : ""}</footer>
                        </article>;
                      })}
                    </div>
                    <article className="report-card analytics-chart-card">
                      <header><div><h3>Diễn biến điểm sao</h3><p>Điểm quy đổi về thang {reportScale}; trục dọc tự căn theo vùng điểm để dễ thấy thay đổi.</p></div><span className="report-scale-badge">{dailyAnalyticsRows.length} ngày</span></header>
                      {dailyAnalyticsPlatforms.some((platform) => dailyAnalyticsRows.some((row) => row.metrics[platform]?.rating != null)) ? <>
                        <div className="analytics-chart-scroll">
                          <ResponsiveContainer width="100%" height={340}>
                            <LineChart data={dailyAnalyticsChartData} margin={{ top: 12, right: 18, bottom: 8, left: 8 }}>
                              <CartesianGrid stroke="#e8edf5" strokeDasharray="3 5" vertical={false} />
                              <XAxis dataKey="date" tickFormatter={(value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "UTC" })} minTickGap={22} tick={{ fill: "#71819a", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#dfe6f0" }} />
                              <YAxis domain={[dailyAnalyticsScoreDomain.min, dailyAnalyticsScoreDomain.max]} tickFormatter={(value: number) => value.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} width={48} tick={{ fill: "#71819a", fontSize: 11 }} tickLine={false} axisLine={false} />
                              <Tooltip labelFormatter={(value) => new Date(`${String(value)}T12:00:00Z`).toLocaleDateString("vi-VN", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" })} formatter={(value, name) => [typeof value === "number" ? `${value.toFixed(1).replace(".", ",")} / ${reportScale}` : "—", platformLabels[name as Platform] ?? String(name)]} contentStyle={{ border: "1px solid #dfe6f0", borderRadius: 10, boxShadow: "0 8px 24px #1b2b4518", fontSize: 12 }} labelStyle={{ color: "#344862", fontWeight: 700, marginBottom: 5 }} />
                              <Legend verticalAlign="bottom" height={34} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "#5f7086" }} formatter={(value) => platformLabels[value as Platform] ?? String(value)} />
                              {dailyAnalyticsPlatforms.map((platform) => <Line key={platform} type="linear" dataKey={platform} name={platform} stroke={reportPlatformColors[platform]} strokeWidth={2.5} dot={false} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />)}
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </> : <p className="report-empty">Khoảng thời gian này chưa có điểm sao để vẽ biểu đồ.</p>}
                    </article>
                    <article className="report-card analytics-chart-card">
                      <header><div><h3>{"Di\u1ec5n bi\u1ebfn l\u01b0\u1ee3t \u0111\u00e1nh gi\u00e1"}</h3><p>{"S\u1ed1 l\u01b0\u1ee3t \u0111\u00e1nh gi\u00e1 \u0111\u01b0\u1ee3c ch\u1ed1t theo ng\u00e0y, hi\u1ec3n th\u1ecb ri\u00eang cho t\u1eebng n\u1ec1n t\u1ea3ng."}</p></div><span className="report-total-badge">{dailyAnalyticsRows.length} {"ng\u00e0y"}</span></header>
                      {dailyAnalyticsPlatforms.some((platform) => dailyAnalyticsRows.some((row) => row.metrics[platform]?.reviewCount != null)) ? <div className="analytics-chart-scroll">
                        <ResponsiveContainer width="100%" height={340}>
                          <LineChart data={dailyAnalyticsReviewChartData} margin={{ top: 12, right: 18, bottom: 8, left: 8 }}>
                            <CartesianGrid stroke="#e8edf5" strokeDasharray="3 5" vertical={false} />
                            <XAxis dataKey="date" tickFormatter={(value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "UTC" })} minTickGap={22} tick={{ fill: "#71819a", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#dfe6f0" }} />
                            <YAxis domain={[0, "auto"]} allowDecimals={false} tickFormatter={(value: number) => moneyless(value)} width={58} tick={{ fill: "#71819a", fontSize: 11 }} tickLine={false} axisLine={false} />
                            <Tooltip labelFormatter={(value) => new Date(`${String(value)}T12:00:00Z`).toLocaleDateString("vi-VN", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" })} formatter={(value, name) => [typeof value === "number" ? `${moneyless(value)} \u0111\u00e1nh gi\u00e1` : "—", platformLabels[name as Platform] ?? String(name)]} contentStyle={{ border: "1px solid #dfe6f0", borderRadius: 10, boxShadow: "0 8px 24px #1b2b4518", fontSize: 12 }} labelStyle={{ color: "#344862", fontWeight: 700, marginBottom: 5 }} />
                            <Legend verticalAlign="bottom" height={34} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "#5f7086" }} formatter={(value) => platformLabels[value as Platform] ?? String(value)} />
                            {dailyAnalyticsPlatforms.map((platform) => <Line key={platform} type="linear" dataKey={platform} name={platform} stroke={reportPlatformColors[platform]} strokeWidth={2.5} dot={false} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />)}
                          </LineChart>
                        </ResponsiveContainer>
                      </div> : <p className="report-empty">{"Kho\u1ea3ng th\u1eddi gian n\u00e0y ch\u01b0a c\u00f3 s\u1ed1 l\u01b0\u1ee3t \u0111\u00e1nh gi\u00e1 \u0111\u01b0\u1ee3c ch\u1ed1t."}</p>}
                    </article>
                  </>}
          </section>}

          {isComparePage && <section className="compare-reports-page" aria-labelledby="compare-reports-title">
            <header className="daily-analytics-heading"><div><div className="section-kicker"><TrendingUp size={14} /> ĐỐI CHIẾU DỮ LIỆU ĐÃ CHỐT</div><h1 id="compare-reports-title">So sánh các báo cáo</h1><p>Đối chiếu điểm và số lượt đánh giá theo ngày giữa các cơ sở cùng loại, trên cùng nguồn dữ liệu.</p></div>
              <label className="analytics-range-picker"><Store size={15} /><span>Loại cơ sở</span><select value={selectedType} onChange={(event) => changeLocationType(event.target.value as LocationFilterType)} aria-label="Chọn loại cơ sở để so sánh">{filterTypeOptions.map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></label>
              <label className="analytics-range-picker"><CalendarDays size={15} /><span>Khoảng thời gian</span><select value={compareRange} onChange={(event) => setCompareRange(event.target.value as typeof compareRange)} aria-label="Chọn khoảng thời gian so sánh"><option value="7">7 ngày gần nhất</option><option value="all">Toàn bộ dữ liệu</option><option value="30">30 ngày gần nhất</option><option value="90">90 ngày gần nhất</option><option value="365">365 ngày gần nhất</option></select></label>
            </header>
            <fieldset className="analytics-source-filter"><legend>Cơ sở so sánh · {filterTypeOptions.find(([type]) => type === selectedType)?.[1]}</legend><div className="analytics-source-options">
              <button type="button" className={`analytics-source-chip ${comparisonSelectedIds === null ? "active" : ""}`} aria-pressed={comparisonSelectedIds === null} onClick={() => setComparisonSelectedIds(null)}>Tất cả cơ sở</button>
              {typeLocations.map((location) => <label className={`analytics-source-chip ${draftComparisonLocations.some((item) => item.id === location.id) ? "active" : ""}`} key={location.id}><input type="checkbox" checked={draftComparisonLocations.some((item) => item.id === location.id)} onChange={() => setComparisonSelectedIds((current) => {
                const selected = current ?? typeLocations.map((item) => item.id);
                if (selected.includes(location.id)) return selected.length > 1 ? selected.filter((id) => id !== location.id) : selected;
                return typeLocations.filter((item) => selected.includes(item.id) || item.id === location.id).map((item) => item.id);
              })} />{location.name}</label>)}
              <button type="button" className="button button-primary" onClick={() => setAppliedComparisonIds(comparisonSelectedIds)}>Áp dụng cơ sở</button>
            </div></fieldset>
            <fieldset className="analytics-source-filter"><legend>Nguồn đánh giá</legend><div className="analytics-source-options">
              <button type="button" className={`analytics-source-chip ${reportPlatforms.length === reportPlatformOrder.length ? "active" : ""}`} aria-pressed={reportPlatforms.length === reportPlatformOrder.length} onClick={() => setReportPlatforms(reportPlatformOrder)}>Tất cả nguồn</button>
              {reportPlatformOrder.map((platform) => <label className={`analytics-source-chip ${reportPlatforms.includes(platform) ? "active" : ""}`} key={platform}><input type="checkbox" checked={reportPlatforms.includes(platform)} onChange={() => setReportPlatforms((current) => current.includes(platform) ? current.length > 1 ? current.filter((item) => item !== platform) : current : reportPlatformOrder.filter((item) => current.includes(item) || item === platform))} /><span className="report-platform-dot" style={{ backgroundColor: reportPlatformColors[platform] }} />{platformLabels[platform]}</label>)}
            </div></fieldset>
            {timelineLoading ? <div className="timeline-panel timeline-empty"><LoaderCircle size={17} className="spin" />Đang tải báo cáo đã chốt…</div> : timelineError ? <div className="timeline-panel timeline-empty timeline-error">Không tải được báo cáo: {timelineError}</div> : hotelComparisonData.scoreRows.length === 0 && hotelComparisonData.reviewRows.length === 0 ? <div className="timeline-panel timeline-empty"><Clock3 size={18} />Chưa có dữ liệu đã chốt cho lựa chọn này.</div> : <>
              <div className="compare-summary"><strong>{comparisonLocations.length} cơ sở</strong><span>{new Set([...hotelComparisonData.scoreRows, ...hotelComparisonData.reviewRows].map((row) => row.date)).size} ngày có dữ liệu</span><span>{reportPlatforms.length} nguồn đang chọn</span></div>
              {hotelComparisonData.scoreRows.length > 0 && <article className="report-card analytics-chart-card hotel-comparison-card"><header><div><h3>Điểm đánh giá theo ngày</h3><p>Điểm trung bình các nguồn được chọn, chuẩn hóa về thang {reportScale}. Mỗi màu đại diện cho một cơ sở.</p></div></header><div className="hotel-comparison-scroll"><div style={{ minWidth: Math.max(680, hotelComparisonData.scoreRows.length * Math.max(70, comparisonLocations.length * 24)) }}><ResponsiveContainer width="100%" height={390}><BarChart data={hotelComparisonData.scoreRows} margin={{ top: 12, right: 20, bottom: 8, left: 8 }}><CartesianGrid stroke="#e8edf5" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="date" tickFormatter={(value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "UTC" })} tick={{ fill: "#71819a", fontSize: 11 }} tickLine={false} /><YAxis domain={[0, reportScale]} width={38} tickLine={false} axisLine={false} /><Tooltip labelFormatter={(value) => new Date(`${String(value)}T12:00:00Z`).toLocaleDateString("vi-VN", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" })} formatter={(value, name) => [typeof value === "number" ? `${value.toFixed(1).replace(".", ",")} / ${reportScale}` : "—", String(name)]} /><Legend verticalAlign="bottom" height={40} />{comparisonLocations.map((location, index) => <Bar key={location.id} dataKey={location.id} name={location.name} fill={["#3568c8", "#d88a3d", "#22a28d", "#8b63c7", "#c75c73", "#5b8e46"][index % 6]} maxBarSize={32} isAnimationActive={false} />)}</BarChart></ResponsiveContainer></div></div></article>}
              {hotelComparisonData.reviewRows.length > 0 && <article className="report-card analytics-chart-card hotel-comparison-card"><header><div><h3>Lượt đánh giá theo ngày</h3><p>Tổng lượt đánh giá đã chốt từ các nguồn được chọn cho từng cơ sở.</p></div></header><div className="hotel-comparison-scroll"><div style={{ minWidth: Math.max(680, hotelComparisonData.reviewRows.length * Math.max(70, comparisonLocations.length * 24)) }}><ResponsiveContainer width="100%" height={390}><BarChart data={hotelComparisonData.reviewRows} margin={{ top: 12, right: 20, bottom: 8, left: 8 }}><CartesianGrid stroke="#e8edf5" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="date" tickFormatter={(value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "UTC" })} tick={{ fill: "#71819a", fontSize: 11 }} tickLine={false} /><YAxis domain={[0, "auto"]} allowDecimals={false} tickFormatter={(value: number) => moneyless(value)} width={58} tickLine={false} axisLine={false} /><Tooltip labelFormatter={(value) => new Date(`${String(value)}T12:00:00Z`).toLocaleDateString("vi-VN", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" })} formatter={(value, name) => [typeof value === "number" ? `${moneyless(value)} lượt` : "—", String(name)]} /><Legend verticalAlign="bottom" height={40} />{comparisonLocations.map((location, index) => <Bar key={location.id} dataKey={location.id} name={location.name} fill={["#3568c8", "#d88a3d", "#22a28d", "#8b63c7", "#c75c73", "#5b8e46"][index % 6]} maxBarSize={32} isAnimationActive={false} />)}</BarChart></ResponsiveContainer></div></div></article>}
              <DailyComparisonChanges locations={comparisonLocations} scoreRows={hotelComparisonData.scoreRows} reviewRows={hotelComparisonData.reviewRows} snapshots={timelineSnapshots} platforms={selectedReportPlatforms} ratingScale={reportScale} />
              <article className="report-card compare-table-card"><header><div><h3>Số liệu gần nhất theo cơ sở</h3><p>Mỗi chỉ số lấy từ ngày chốt gần nhất có dữ liệu trong khoảng thời gian đang chọn.</p></div></header><div className="compare-table-scroll"><table><thead><tr><th>Cơ sở</th><th>Điểm / {reportScale}</th><th>Ngày chốt điểm</th><th>Lượt đánh giá</th><th>Ngày chốt lượt</th></tr></thead><tbody>{comparisonLocations.map((location) => {
                const scoreRow = [...hotelComparisonData.scoreRows].reverse().find((row) => row[location.id] != null);
                const reviewRow = [...hotelComparisonData.reviewRows].reverse().find((row) => row[location.id] != null);
                return <tr key={location.id}><th scope="row">{location.name}</th><td>{typeof scoreRow?.[location.id] === "number" ? `${(scoreRow[location.id] as number).toFixed(1).replace(".", ",")}` : "—"}</td><td>{scoreRow ? new Date(`${scoreRow.date}T12:00:00Z`).toLocaleDateString("vi-VN", { timeZone: "UTC" }) : "—"}</td><td>{typeof reviewRow?.[location.id] === "number" ? moneyless(reviewRow[location.id] as number) : "—"}</td><td>{reviewRow ? new Date(`${reviewRow.date}T12:00:00Z`).toLocaleDateString("vi-VN", { timeZone: "UTC" }) : "—"}</td></tr>;
              })}</tbody></table></div></article>
            </>}
          </section>}

          {isTripadvisorRankPage && <TripadvisorRankReportPage locationName={dashboardLocation?.name ?? null} rows={tripadvisorRankRows} loading={timelineLoading} error={timelineError} range={dailyReportRange} onRangeChange={setDailyReportRange} />}

          {!isReportDataPage && !isSettingsPage && <>
          <section className="insight-row" id="platforms">
            <div className="insight-copy"><div className="section-kicker"><span className="live-mark" /> KẾT QUẢ THEO CƠ SỞ</div><h2>{dashboardLocation ? dashboardLocation.name : "Chưa chọn cơ sở"}</h2><p>Điểm được chuẩn hóa về thang {reportScale}; lượt đánh giá hiển thị riêng cho từng nền tảng.</p></div>
            <div className="platform-summary">{reportData.selectedPlatforms.map((platform) => {
              const platformClass = platform === "google" ? "google-logo" : platform === "tripadvisor" ? "trip-logo" : `${platform}-logo`;
              const logoText = platform === "google" ? "G" : platform === "tripadvisor" ? "T" : platform === "booking" ? "B" : platform === "tripcom" ? "TC" : platform === "expedia" ? "E" : platform === "traveloka" ? "T" : platform === "grabfood" ? "Gr" : "A";
              const metric = dashboardLocation?.[platform];
              const score = metric?.rating == null ? null : (metric.rating / metric.ratingScale) * reportScale;
              return <div className="platform-item" key={platform}><span className={`platform-logo ${platformClass}`}>{logoText}</span><div><strong>{platformLabels[platform]}</strong><small>{metric?.reviewCount == null ? "Chưa có lượt đánh giá" : `${moneyless(metric.reviewCount)} ${metric.countLabel}`}</small></div><span className="platform-value">{score == null ? "—" : score.toFixed(1).replace(".", ",")}<small> / {reportScale}</small></span></div>;
            })}</div>
            <div className="insight-decoration"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit-center"><Star size={21} fill="currentColor" /></div><span className="orbit-dot orbit-dot-one" /><span className="orbit-dot orbit-dot-two" /></div>
          </section>

        <section className="locations-section" id="locations">
            <div className="section-header"><div><div className="section-kicker"><Building2 size={14} strokeWidth={1.8} />CHI TIẾT CHI NHÁNH</div><h2>Nền tảng · {dashboardLocation?.name ?? "Chưa chọn cơ sở"}</h2><p>Mỗi thẻ là một nền tảng, chỉ hiển thị dữ liệu của cơ sở đang chọn.</p></div></div>
            <div className="platform-detail-grid">
            {(["google", "tripadvisor", "agoda", "booking", "tripcom", "expedia", "traveloka", "grabfood"] as const).filter((platform) => selectedReportPlatforms.includes(platform)).map((platform) => {
              const platformLabel = platformLabels[platform];
              const metricKey = platform;
              const crawlIcon = <RefreshCw size={15} strokeWidth={1.8} />;
              const isScale10 = ["agoda", "booking", "tripcom", "expedia", "traveloka"].includes(platform);
              return <section className={`platform-table-section ${platform}`} key={platform} aria-labelledby={`${platform}-table-title`}>
                <header className="platform-table-heading"><div className={`platform-logo brand-logo ${platform}`}><PlatformBrandLogo platform={platform} /></div><div><h3 id={`${platform}-table-title`}>{platformLabel}</h3><p>{branchLocations.length} chi nhánh đang xem</p></div><div className="platform-table-actions"><button className="button button-outline" onClick={() => { setSnapshotPlatform(platform); setModal("snapshot"); }} disabled={!dashboardLocation}><Plus size={15} />Nhập số liệu</button><button className="button button-outline finalize-button" onClick={() => void finalizeDailySnapshot(platform)} disabled={!dashboardLocation || !dashboardLocation[platform] || finalizingPlatform !== null || finalizingAll || crawling}>{finalizingPlatform === platform ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}Chốt hôm nay</button><button className="button button-outline" onClick={() => dashboardLocation && void triggerCrawl(platform, dashboardLocation.id)} disabled={crawling || !dashboardLocation}>{crawling && crawlingPlatform === platform && crawlingTargetId === dashboardLocation?.id ? <LoaderCircle size={15} className="spin" /> : crawlIcon}Cập nhật {platformLabel}</button></div></header>
                {branchLocations.map((location) => {
                  const metric = location[metricKey] ?? null;
                  const sourceUrl = getPlatformUrl(location, platform);
                  return <dl className="platform-detail-list" key={location.id}>
                    <div className="pd-score"><dt>Điểm {isScale10 ? "(thang 10)" : "(thang 5)"}</dt><dd><RatingCell metric={metric} platform={platform} /></dd></div>
                    {platform === "tripadvisor" && <div><dt>Xếp hạng</dt><dd>{metric?.tripadvisorRank || "—"}</dd></div>}
                    <div><dt>Số đánh giá</dt><dd><ReviewCountCell metric={metric} /></dd></div>
                    <div><dt>Cập nhật</dt><dd>{metric?.capturedAt ? dateText.format(new Date(metric.capturedAt)) : "Chưa có dữ liệu"}</dd></div>
                    {platform === "tripadvisor" && metric?.tripadvisorNotice && <div className="pd-notice"><dt>Thư từ Tripadvisor</dt><dd>{metric.tripadvisorNotice}</dd></div>}
                    <div><dt>Nguồn</dt><dd>{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer">Mở liên kết</a> : platform === "grabfood" ? "Tài khoản merchant" : "Chưa có liên kết"}</dd></div>
                  </dl>;
                })}
                {!branchLocations.length && <div className="empty-table"><span className="empty-icon"><Search size={19} /></span><strong>{loading ? "Đang tải danh sách…" : "Chưa có chi nhánh được chọn"}</strong><p>{locations.length ? "Chọn cơ sở ở thanh trên để xem dữ liệu." : "Thêm cơ sở trong Cài đặt để bắt đầu theo dõi."}</p>{!locations.length && <Link className="button button-primary" href="/settings#settings-locations"><Settings2 size={16} />Cấu hình cơ sở</Link>}</div>}
              </section>;
            })}
            </div>
          </section>
          </>}

          {isSettingsPage && <section className="report-settings-section" id="settings" aria-labelledby="report-settings-title">
            <div className="report-settings-intro"><div className="section-kicker"><Settings2 size={14} /> CÀI ĐẶT</div><h2 id="report-settings-title">Cấu hình báo cáo</h2><p>Chọn thang điểm chuẩn hóa và các nền tảng được tính vào báo cáo. Tùy chọn được lưu trên trình duyệt này.</p></div>
            <div className="report-settings-controls">
              <fieldset className="report-setting-group"><legend>Thang điểm báo cáo</legend><div className="scale-options">
                {[5, 10].map((scale) => <label className={`scale-option ${reportScale === scale ? "selected" : ""}`} key={scale}><input type="radio" name="report-scale" value={scale} checked={reportScale === scale} onChange={() => setReportScale(scale as 5 | 10)} /><span>{scale} điểm</span></label>)}
              </div><small>Quy đổi: điểm gốc ÷ thang gốc × {reportScale}.</small></fieldset>
              <fieldset className="report-setting-group"><legend>Nền tảng đưa vào báo cáo</legend><div className="report-platform-options">
                {reportPlatformOrder.map((platform) => <label className="report-platform-option" key={platform}><input type="checkbox" checked={reportPlatforms.includes(platform)} onChange={() => setReportPlatforms((current) => current.includes(platform) ? current.length > 1 ? current.filter((item) => item !== platform) : current : [...current, platform])} /><span className="report-platform-dot" style={{ backgroundColor: reportPlatformColors[platform] }} />{platformLabels[platform]}</label>)}
              </div><small>Tổng lượt đánh giá cộng số mới nhất của các nền tảng được chọn.</small></fieldset>
            </div>
          </section>}

          {isSettingsPage && <AutomaticSyncSettings userId={user?.id ?? null} locations={locations} />}
          {isSettingsPage && <section className="location-settings-section" id="settings-locations" aria-labelledby="location-settings-title">
            <header className="location-settings-heading">
              <div><div className="section-kicker"><Settings2 size={14} /> CÀI ĐẶT · CƠ SỞ</div><h2 id="location-settings-title">Cấu hình cơ sở</h2><p>Quản lý thông tin và liên kết nền tảng cho từng cơ sở.</p></div>
              <button className="button button-primary" onClick={() => openLocationModal()}><Plus size={16} />Thêm cơ sở</button>
            </header>
            <div className="table-panel location-settings-panel">
              <div className="table-scroll"><table className="location-settings-table"><thead><tr><th>CƠ SỞ</th><th>LOẠI HÌNH</th><th>NỀN TẢNG ĐÃ KẾT NỐI</th><th><span className="sr-only">Thao tác</span></th></tr></thead><tbody>
                {locations.map((location) => {
                  const configuredLinks: Array<{ platform: Platform; url: string | undefined }> = [
                    { platform: "google", url: location.googleUrl },
                    { platform: "tripadvisor", url: location.tripadvisorUrl },
                    { platform: "agoda", url: location.agodaUrl },
                    { platform: "booking", url: location.bookingUrl },
                    { platform: "tripcom", url: location.tripcomUrl },
                    { platform: "expedia", url: location.expediaUrl },
                    { platform: "traveloka", url: location.travelokaUrl },
                    { platform: "grabfood", url: location.grabfoodUrl },
                  ];
                  const links = configuredLinks.filter((item): item is { platform: Platform; url: string } => Boolean(item.url));
                  return <tr key={location.id}>
                    <td><div className="location-cell"><span className={`location-icon ${location.type}`}>{location.type === "hotel" ? <Building2 size={17} /> : location.type === "cafe" ? <Utensils size={17} /> : <Store size={17} />}</span><span className="location-name"><strong>{location.name}</strong><small><MapPin size={12} />{location.area || "Chưa có khu vực"}</small></span></div></td>
                    <td><span className={`type-chip ${location.type}`}>{typeLabels[location.type]}</span></td>
                    <td><div className="config-platform-links">{links.length ? links.map(({ platform, url }) => <a key={platform} href={url} target="_blank" rel="noreferrer">{platformLabels[platform]}</a>) : <span className="no-metric">Chưa kết nối</span>}</div></td>
                    <td><div className="row-actions"><button className="icon-button" onClick={() => openLocationModal(location)} aria-label={"Sửa " + location.name} title="Sửa cấu hình"><Settings2 size={17} /></button><button className="icon-button danger-hover" onClick={() => void deleteLocation(location)} aria-label={"Xóa " + location.name} title="Xóa cơ sở"><Trash2 size={16} /></button></div></td>
                  </tr>;
                })}
                {!locations.length && <tr><td colSpan={4}><div className="empty-table"><span className="empty-icon"><Building2 size={19} /></span><strong>{loading ? "Đang tải danh sách…" : "Chưa có cơ sở"}</strong><p>Thêm cơ sở để bắt đầu cấu hình các liên kết nền tảng.</p>{!loading && <button className="button button-primary" onClick={() => openLocationModal()}><Plus size={16} />Thêm cơ sở</button>}</div></td></tr>}
              </tbody></table></div>
              <div className="table-footer"><span><strong>{locations.length}</strong> cơ sở</span><span><span className="footer-dot" />{supabaseConfigured ? "Dữ liệu theo tài khoản" : "Dữ liệu demo trong trình duyệt"}</span></div>
            </div>
          </section>}

          <footer className="page-footer"><span>Reviewdesk · Theo dõi đánh giá đa nền tảng</span><span><ShieldCheck size={14} /> Dữ liệu theo tài khoản</span></footer>
        </div>
      </main>

      {modal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header className="modal-header"><div><span className="section-kicker">{modal === "location" ? "THÔNG TIN CƠ SỞ" : `NHẬP SỐ LIỆU · ${snapshotPlatform.toUpperCase()}`}</span><h2 id="modal-title">{modal === "location" ? editing ? "Chỉnh sửa cơ sở" : "Thêm cơ sở mới" : `Ghi nhận ${platformLabels[snapshotPlatform]}`}</h2><p>{modal === "location" ? "Quản lý thông tin và liên kết các nền tảng." : `Lưu điểm và số lượng đánh giá cho ${platformLabels[snapshotPlatform]}.`}</p></div><button className="icon-button" onClick={closeModal} aria-label="Đóng hộp thoại"><X size={18} /></button></header>
        {error && <div className="modal-error" role="alert">{error}</div>}
        {modal === "location" ? <form data-draft-modal="location" onSubmit={saveLocation} onInput={(event) => saveFormDraft(event, "location")} onChange={(event) => saveFormDraft(event, "location")}><div className="form-grid location-links-grid" data-location-type={locationFormType}><label className="field full-field">Tên cơ sở<input name="name" required maxLength={160} defaultValue={locationFormValues.name ?? editing?.name ?? ""} placeholder="Ví dụ: Mộc Nhiên Coffee Quận 1" /></label><label className="field">Khu vực / địa chỉ<input name="area" maxLength={180} defaultValue={locationFormValues.area ?? editing?.area ?? ""} placeholder="Quận 1 · TP. Hồ Chí Minh" /></label><label className="field">Loại hình<select name="type" value={locationFormType} onChange={(event) => setLocationFormType(event.target.value as LocationType)}><option value="hotel">Khách sạn</option><option value="cafe">Cafe</option><option value="mart">Mart 24h</option></select></label><label className="field full-field location-link-field" data-link-platform="google">Google Maps URL<input name="googleUrl" type="url" defaultValue={locationFormValues.googleUrl ?? editing?.googleUrl ?? ""} placeholder="https://maps.google.com/..." /></label><label className="field full-field location-link-field" data-link-platform="tripadvisor">Tripadvisor URL<input name="tripadvisorUrl" type="url" defaultValue={locationFormValues.tripadvisorUrl ?? editing?.tripadvisorUrl ?? ""} placeholder="https://www.tripadvisor.com/..." /></label><label className="field full-field location-link-field" data-link-platform="agoda">Agoda URL<input name="agodaUrl" type="url" defaultValue={locationFormValues.agodaUrl ?? editing?.agodaUrl ?? ""} placeholder="https://www.agoda.com/..." /></label><label className="field full-field location-link-field" data-link-platform="booking">Booking.com URL<input name="bookingUrl" type="url" defaultValue={locationFormValues.bookingUrl ?? editing?.bookingUrl ?? ""} placeholder="https://www.booking.com/hotel/..." /></label><label className="field full-field location-link-field" data-link-platform="tripcom">Trip.com URL<input name="tripcomUrl" type="url" defaultValue={locationFormValues.tripcomUrl ?? editing?.tripcomUrl ?? ""} placeholder="https://www.trip.com/hotels/detail/..." /></label><label className="field full-field location-link-field" data-link-platform="expedia">Expedia URL<input name="expediaUrl" type="url" defaultValue={locationFormValues.expediaUrl ?? editing?.expediaUrl ?? ""} placeholder="https://www.expedia.com.vn/..." /></label><label className="field full-field location-link-field" data-link-platform="traveloka">Traveloka URL<input name="travelokaUrl" type="url" defaultValue={locationFormValues.travelokaUrl ?? editing?.travelokaUrl ?? ""} placeholder="https://www.traveloka.com/vi-vn/hotel/detail?..." /></label><label className="field full-field location-link-field" data-link-platform="grabfood">GrabFood URL<input name="grabfoodUrl" type="url" defaultValue={locationFormValues.grabfoodUrl ?? editing?.grabfoodUrl ?? ""} placeholder="https://food.grab.com/..." /></label><label className="field location-link-field" data-link-platform="grabfood">Tài khoản Grab merchant<input name="grabUser" autoComplete="off" maxLength={200} value={grabAccount.username} onChange={(event) => setGrabAccount((account) => ({ ...account, username: event.target.value }))} placeholder="Để trống để xóa tài khoản" /></label><label className="field location-link-field" data-link-platform="grabfood">Mật khẩu Grab<input name="grabPassword" type="password" autoComplete="new-password" maxLength={200} placeholder={grabAccount.hasPassword ? "Để trống để giữ mật khẩu cũ" : "Mật khẩu"} /></label><label className="field full-field location-link-field" data-link-platform="shopeefood">ShopeeFood URL<input name="shopeefoodUrl" type="url" defaultValue={locationFormValues.shopeefoodUrl ?? editing?.shopeefoodUrl ?? ""} placeholder="https://shopeefood.vn/..." /></label></div><div className="modal-footer"><button type="button" className="button button-outline" onClick={closeModal}>Hủy</button><button className="button button-primary" disabled={saving}>{saving && <LoaderCircle size={15} className="spin" />}{editing ? "Lưu thay đổi" : "Thêm cơ sở"}</button></div></form> : <form data-draft-modal="snapshot" onSubmit={saveSnapshot} onInput={(event) => saveFormDraft(event, "snapshot")} onChange={(event) => saveFormDraft(event, "snapshot")}><input type="hidden" name="platform" value={snapshotPlatform} /><input type="hidden" name="source" value="manual" />{snapshotPlatform === "expedia" && <label className="field full-field">Nhập từ file Markdown Expedia<input type="file" accept=".md,text/markdown,text/plain" onChange={async (event) => { const file = event.currentTarget.files?.[0]; const form = event.currentTarget.form; if (!file || !form) return; try { const imported = parseExpediaMarkdown(await file.text()); (form.elements.namedItem("rating") as HTMLInputElement).value = String(imported.rating);  (form.elements.namedItem("reviewCount") as HTMLInputElement).value = String(imported.reviewCount); (form.elements.namedItem("countLabel") as HTMLInputElement).value = "nhận xét"; (form.elements.namedItem("source") as HTMLInputElement).value = "import"; const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim(); const location = locations.find((item) => normalize(item.name) === normalize(imported.propertyName)); if (location) (form.elements.namedItem("locationId") as HTMLSelectElement).value = location.id; form.dispatchEvent(new Event("change", { bubbles: true })); setError(""); setNotice(`Đã đọc ${imported.rating.toFixed(1)}/10, ${moneyless(imported.reviewCount)} nhận xét${location ? ` cho ${location.name}` : ` cho ${imported.propertyName || "khách sạn"}; hãy chọn đúng cơ sở`}.`); } catch (error) { setError(error instanceof Error ? error.message : String(error)); } }} /></label>}<div className="form-grid"><label className="field full-field">Cơ sở<select name="locationId" required defaultValue={snapshotFormValues.locationId ?? dashboardLocation?.id ?? locations[0]?.id}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label><label className="field">Điểm đánh giá<input name="rating" type="number" min="0" defaultValue={snapshotFormValues.rating ?? ""} max={DEFAULT_RATING_SCALE[snapshotPlatform]} step="0.1" placeholder={["agoda", "booking", "tripcom", "expedia", "traveloka"].includes(snapshotPlatform) ? "Ví dụ: 9.5" : "Ví dụ: 4.7"} /></label><label className="field">Số nhận xét<input name="reviewCount" type="number" min="0" defaultValue={snapshotFormValues.reviewCount ?? ""} step="1" placeholder={["agoda", "booking", "tripcom", "expedia", "traveloka"].includes(snapshotPlatform) ? "Ví dụ: 375" : "Ví dụ: 1284"} /></label><label className="field">Nhãn số lượng<input name="countLabel" defaultValue={snapshotFormValues.countLabel ?? (snapshotPlatform === "expedia" ? "nh\u1eadn x\u00e9t" : "\u0111\u00e1nh gi\u00e1")} /></label></div><p className="form-hint">Có thể để trống một chỉ số nếu nền tảng không hiển thị chỉ số đó.</p><div className="modal-footer"><button type="button" className="button button-outline" onClick={closeModal}>Hủy</button><button className="button button-primary" disabled={saving}>{saving && <LoaderCircle size={15} className="spin" />}Lưu snapshot</button></div></form>}
      </section></div>}
    </div>
  );
}

function StatCard({ icon, label, value, meta, tone, suffix }: { icon: ReactNode; label: string; value: string; meta: string; tone: string; suffix?: string }) {
  return <article className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div className="stat-label">{label}</div><div className="stat-number">{value}{suffix && <span>{suffix}</span>}</div><div className="stat-meta">{meta}</div></article>;
}

function RatingCell({ metric, platform }: { metric: Metric | null; platform: Platform }) {
  if (!metric || metric.rating == null) {
    return <div className="rating-cell-content"><span className="no-metric">—</span>{}</div>;
  }
  const scoreClass =
    platform === "google"
      ? "score-google"
      : platform === "tripadvisor"
        ? "score-trip"
        : platform === "agoda"
          ? "score-agoda"
          : platform === "booking"
            ? "score-booking"
            : platform === "tripcom"
              ? "score-tripcom"
              : platform === "expedia"
                ? "score-expedia"
                : platform === "traveloka"
                  ? "score-traveloka"
                  : "score-grabfood";
  return (
    <div className="rating-cell-content"><span className={`score-pill ${scoreClass}`}>
      <Star size={13} fill="currentColor" />{metric.rating.toFixed(1).replace(".", ",")}
      {metric.ratingScale === 10 && <small style={{ fontSize: "9px", marginLeft: "2px", opacity: 0.85 }}>/10</small>}
    </span>{}</div>
  );
}

function ReviewCountCell({ metric }: { metric: Metric | null }) {
  return <span className="review-count">{metric?.reviewCount == null ? "Chưa có số lượng" : `${moneyless(metric.reviewCount)} ${metric.countLabel}`}</span>;
}

function AuthScreen({ error, onClearError }: { error: string; onClearError: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem("reviewdesk-auth-form-draft");
      if (!saved) return;
      const draft = JSON.parse(saved) as { mode?: string; email?: string };
      if (draft.mode === "signin" || draft.mode === "signup") setMode(draft.mode);
      if (typeof draft.email === "string") setEmail(draft.email);
    } catch {
      // Ignore unavailable or malformed session storage.
    }
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    onClearError();
    setMessage("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const supabase = createClient();
    const result = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
    if (!result.error && mode === "signin") {
      try {
        window.sessionStorage.removeItem("reviewdesk-auth-form-draft");
      } catch {
        // Authentication should not depend on session storage.
      }
    }
    if (result.error) setMessage(result.error.message);
    else if (mode === "signup" && !result.data.session) setMessage("Kiểm tra email để xác nhận tài khoản, sau đó quay lại đăng nhập.");
    setPending(false);
  }
  return <main className="auth-screen"><div className="auth-left"><a className="brand auth-brand" href="#"><span className="brand-mark"><Activity size={19} /></span><span>reviewdesk<span className="brand-period">.</span></span></a><div className="auth-copy"><div className="eyebrow"><ShieldCheck size={14} /> QUẢN LÝ ĐÁNH GIÁ AN TOÀN</div><h1>Mọi cơ sở.<br /><em>Một góc nhìn.</em></h1><p>Theo dõi danh tiếng thương hiệu trên Google Maps và Tripadvisor trong cùng một không gian.</p><div className="auth-proof"><span><Check size={14} /> Dữ liệu được phân tách theo tài khoản</span><span><Check size={14} /> Lưu lịch sử theo từng snapshot</span></div></div><div className="auth-visual"><div className="auth-chart"><span style={{ height: "39%" }} /><span style={{ height: "55%" }} /><span style={{ height: "48%" }} /><span style={{ height: "72%" }} /><span style={{ height: "63%" }} /><span style={{ height: "86%" }} /><span style={{ height: "76%" }} /><span style={{ height: "100%" }} /></div><div className="auth-float-card"><span className="float-star"><Star size={14} fill="currentColor" /></span><strong>4,8 <small>/ 5</small></strong><span className="float-label">ĐIỂM TRUNG BÌNH</span></div></div><div className="auth-copyright">© 2026 Reviewdesk · Dữ liệu của bạn, quyền kiểm soát của bạn.</div></div><div className="auth-right"><section className="auth-form-wrap"><div className="auth-mobile-brand"><span className="brand-mark"><Activity size={18} /></span>reviewdesk<span className="brand-period">.</span></div><span className="section-kicker">KHÔNG GIAN LÀM VIỆC</span><h2>{mode === "signin" ? "Chào mừng trở lại" : "Tạo tài khoản"}</h2><p className="auth-subtitle">{mode === "signin" ? "Đăng nhập để tiếp tục quản lý cơ sở của bạn." : "Đăng ký để bắt đầu theo dõi đánh giá."}</p><form className="auth-form" onSubmit={submit}><label className="field">Email<input type="email" name="email" required autoComplete="email" placeholder="ban@congty.com" value={email} onChange={(event) => { const nextEmail = event.target.value; setEmail(nextEmail); try { window.sessionStorage.setItem("reviewdesk-auth-form-draft", JSON.stringify({ mode, email: nextEmail })); } catch { /* Keep the field usable without storage. */ } }} /></label><label className="field">Mật khẩu<input type="password" name="password" required minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} placeholder="Tối thiểu 8 ký tự" /></label>{(error || message) && <div className="auth-error" role="alert">{message || error}</div>}<button className="button button-primary auth-submit" disabled={pending}>{pending && <LoaderCircle className="spin" size={16} />}{mode === "signin" ? "Đăng nhập" : "Tạo tài khoản"}<ArrowUpRight size={16} /></button></form><div className="auth-switch">{mode === "signin" ? "Chưa có tài khoản?" : "Đã có tài khoản?"}<button onClick={() => { const nextMode = mode === "signin" ? "signup" : "signin"; setMode(nextMode); setMessage(""); try { window.sessionStorage.setItem("reviewdesk-auth-form-draft", JSON.stringify({ mode: nextMode, email })); } catch { /* Keep mode switching usable without storage. */ } }}>{mode === "signin" ? "Đăng ký" : "Đăng nhập"}</button></div><div className="auth-security"><ShieldCheck size={16} /><span>Kết nối được bảo vệ bởi Supabase Auth và chính sách Row Level Security.</span></div></section></div></main>;
}
