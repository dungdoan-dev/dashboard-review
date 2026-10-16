import os from "node:os";
import path from "node:path";
import type { Page } from "puppeteer";
import { launchBrowser } from "./launch-browser.ts"; // đuôi .ts để CLI chạy bằng Node thuần

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
// Vercel chỉ cho ghi vào thư mục tạm (không giữ phiên giữa các lần chạy: mỗi lần tự đăng nhập lại).
const PROFILE_ROOT = process.env.VERCEL ? path.join(os.tmpdir(), "grab-profile") : path.join(process.cwd(), "scraper", ".grab-profile");

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

const CONTINUE = "continue|tiếp tục";
const REMOVE_ACCOUNT = "xóa tài khoản|remove (an )?account";

/** Grab nhớ tài khoản đã đăng nhập và hiện màn "chào mừng quay lại" thay vì ô nhập tên: "same" nếu đúng tài khoản đang cấu hình. */
export function welcomeScreenFor(pageText: string, user: string): "same" | "other" | null {
  if (!/xóa tài khoản|remove (an )?account/i.test(pageText) || !/tiếp tục|continue/i.test(pageText)) return null;
  return pageText.toLowerCase().includes(user.trim().toLowerCase()) ? "same" : "other";
}

async function clickButton(page: Page, pattern: string, what: string) {
  const clicked = await page.evaluate((source) => {
    const re = new RegExp(source, "i");
    const button = Array.from(document.querySelectorAll<HTMLElement>("button, a, [role=button]")).find((el) => re.test(el.innerText) && !(el as HTMLButtonElement).disabled);
    button?.click();
    return Boolean(button);
  }, pattern);
  if (!clicked) throw new Error(`Không thấy nút "${what}" trên trang đăng nhập.`);
}

async function enterPassword(page: Page, password: string) {
  await page.waitForSelector("#password", { visible: true, timeout: 20_000 });
  await page.type("#password", password, { delay: 40 });
  await clickButton(page, CONTINUE, "Tiếp tục");
  await page.waitForFunction(() => location.hostname === "merchant.grab.com", { timeout: 40_000 });
  await page.goto(FEEDBACK_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
}

/** Hướng 2: bấm "Xóa tài khoản" để quay lại bước nhập tên đăng nhập (có thể có hộp xác nhận). */
async function removeSavedAccount(page: Page) {
  await clickButton(page, REMOVE_ACCOUNT, "Xóa tài khoản");
  const gone = () => page.waitForSelector("#Username", { visible: true, timeout: 8_000 }).then(() => true, () => false);
  if (await gone()) return;
  await clickButton(page, "^\\s*(xóa|remove|đồng ý|xác nhận|confirm|ok)\\s*$", "Xác nhận xóa"); // hộp xác nhận, nếu có
}

/**
 * weblogin.grab.com: tên đăng nhập -> Tiếp tục -> mật khẩu -> Tiếp tục -> cổng merchant. OTP không tự động được.
 * Nếu Grab đang nhớ một tài khoản: đúng tài khoản thì bấm Tiếp tục + nhập mật khẩu (hướng 1), thất bại hoặc khác tài khoản thì Xóa tài khoản rồi nhập lại từ đầu (hướng 2).
 */
async function autoLogin(page: Page, user: string, password: string) {
  await page.waitForFunction(() => document.querySelector("#Username") || /xóa tài khoản|remove (an )?account/i.test(document.body.innerText), { timeout: 20_000 });
  const welcome = welcomeScreenFor(await page.evaluate(() => document.body.innerText), user);
  if (welcome === "same") {
    try {
      await clickButton(page, CONTINUE, "Tiếp tục");
      return await enterPassword(page, password);
    } catch (err) {
      console.warn("Hướng 1 (Tiếp tục) lỗi, chuyển sang xóa tài khoản đã nhớ:", err instanceof Error ? err.message : err);
      await page.goto(FEEDBACK_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForFunction(() => document.querySelector("#Username") || /xóa tài khoản|remove (an )?account/i.test(document.body.innerText), { timeout: 20_000 });
    }
  }
  if (await page.$("#Username") === null) await removeSavedAccount(page);
  await page.waitForSelector("#Username", { visible: true, timeout: 20_000 });
  await page.type("#Username", user, { delay: 40 });
  await clickButton(page, CONTINUE, "Tiếp tục");
  await enterPassword(page, password);
}

/** Reads the merchant feedback score; each account keeps its own browser profile (saved session). */
export async function scrapeGrabFeedback(opts: {
  profileDir: string; headless: boolean; login?: boolean; user?: string; password?: string;
}) {
  const browser = await launchBrowser({ headless: opts.headless, userDataDir: opts.profileDir, ...(opts.headless ? {} : { slowMo: 120 }) });
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
      const screen = (await page.evaluate(() => document.body.innerText).catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 150);
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
        profileDir: grabProfileDir(target.id), headless: process.env.GRAB_HEADED !== "1" || Boolean(process.env.VERCEL), user: target.username, password: target.password,
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
