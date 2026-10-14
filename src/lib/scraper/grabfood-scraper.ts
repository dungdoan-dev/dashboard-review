import path from "node:path";
import puppeteer, { type Page } from "puppeteer";

export interface GrabfoodTarget {
  id: string;
  name: string;
  username: string;
  password: string;
}

export interface GrabfoodResult {
  id: string;
  name: string;
  url: string;
  rating: string | null;
  ratingValue: number | null;
  ratingRaw: string | null;
  count: number | null;
  countRaw: string | null;
  capturedAt: string;
  success: boolean;
  error?: string;
}

const FEEDBACK_URL = "https://merchant.grab.com/feedback";
const PROFILE_ROOT = path.join(process.cwd(), "scraper", ".grab-profile");

/** "Trung bình 4.8 13 đánh giá" -> { ratingValue: 4.8, count: 13 } */
export function parseGrabFeedback(text: string): { ratingValue: number; count: number } | null {
  const match = text.normalize("NFC").match(/Trung bình\s+(\d+(?:[.,]\d+)?)\s+(\d[\d.,]*)\s+đánh giá/i);
  if (!match) return null;
  const ratingValue = Number(match[1].replace(",", "."));
  const count = Number(match[2].replace(/[.,]/g, ""));
  return ratingValue >= 0 && ratingValue <= 5 && Number.isSafeInteger(count) ? { ratingValue, count } : null;
}

async function readFeedback(page: Page, waitMs: number) {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const parsed = parseGrabFeedback(await page.evaluate(() => document.body.innerText).catch(() => ""));
    if (parsed) return parsed;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return null;
}

async function clickContinue(page: Page) {
  const clicked = await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll("button")).find((b) => /continue|tiếp tục/i.test(b.innerText) && !b.disabled);
    button?.click();
    return Boolean(button);
  });
  if (!clicked) throw new Error('Không thấy nút "Tiếp tục" trên trang đăng nhập.');
}

/** Two steps on weblogin.grab.com: username -> Continue -> password -> Continue -> redirected to the merchant portal. OTP cannot be automated. */
async function autoLogin(page: Page, user: string, password: string) {
  await page.waitForSelector("#Username", { visible: true, timeout: 20_000 });
  await page.type("#Username", user, { delay: 40 });
  await clickContinue(page);
  await page.waitForSelector("#password", { visible: true, timeout: 20_000 });
  await page.type("#password", password, { delay: 40 });
  await clickContinue(page);
  await page.waitForFunction(() => location.hostname === "merchant.grab.com", { timeout: 40_000 });
  await page.goto(FEEDBACK_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
}

/** Reads the merchant feedback score; each account keeps its own browser profile (saved session). */
export async function scrapeGrabFeedback(opts: {
  profileDir: string; headless: boolean; login?: boolean; user?: string; password?: string;
}) {
  const browser = await puppeteer.launch({ headless: opts.headless, userDataDir: opts.profileDir, ...(opts.headless ? {} : { slowMo: 120 }) });
  try {
    const page = await browser.newPage();
    await page.goto(FEEDBACK_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    let result = await readFeedback(page, opts.login ? 5_000 : 15_000);
    if (!result && page.url().includes("weblogin.grab.com") && opts.user && opts.password) {
      await autoLogin(page, opts.user, opts.password).catch((err) => console.warn("Tự đăng nhập lỗi:", err.message));
      result = await readFeedback(page, 40_000);
    }
    if (!result && opts.login) {
      console.log("Chưa vào được trang Phản hồi. Hãy đăng nhập tay (OTP nếu có) trong cửa sổ vừa mở, tối đa 10 phút.");
      result = await readFeedback(page, 600_000);
    }
    if (!result) {
      const screen = (await page.evaluate(() => document.body.innerText).catch(() => "")).replace(/s+/g, " ").trim().slice(0, 150);
      if (!opts.headless) await new Promise((resolve) => setTimeout(resolve, 30_000)); // để bạn xem màn hình lỗi
      throw new Error(`Không đọc được điểm (trang: ${page.url().slice(0, 60)}; nội dung: "${screen}"). Nếu Grab đòi xác minh, chạy "npm run scrape:grab:login -- --all" để đăng nhập tay.`);
    }
    return result;
  } finally {
    await browser.close();
  }
}

export function grabProfileDir(locationId: string) {
  return path.join(PROFILE_ROOT, locationId);
}

export async function runGrabfoodScraper(targets: GrabfoodTarget[]) {
  const results: GrabfoodResult[] = [];
  for (const target of targets) {
    const base = { id: target.id, name: target.name, url: FEEDBACK_URL, capturedAt: new Date().toISOString() };
    try {
      const { ratingValue, count } = await scrapeGrabFeedback({
        profileDir: grabProfileDir(target.id), headless: process.env.GRAB_HEADED !== "1", user: target.username, password: target.password,
      });
      results.push({
        ...base, success: true, ratingValue, count,
        rating: ratingValue.toFixed(1).replace(".", ","), ratingRaw: String(ratingValue), countRaw: String(count),
      });
    } catch (error) {
      results.push({
        ...base, success: false, rating: null, ratingValue: null, ratingRaw: null, count: null, countRaw: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {
    success: results.some((r) => r.success),
    totalTargets: targets.length,
    successCount: results.filter((r) => r.success).length,
    results,
  };
}
