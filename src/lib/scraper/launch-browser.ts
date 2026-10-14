import puppeteer, { type Browser, type LaunchOptions } from "puppeteer";

/** Vercel has no Chrome installed: use the bundled serverless Chromium there, the normal Puppeteer Chrome elsewhere. */
export async function launchBrowser(options: LaunchOptions = {}): Promise<Browser> {
  if (!process.env.VERCEL) return puppeteer.launch(options);
  const { default: chromium } = await import("@sparticuz/chromium");
  return puppeteer.launch({
    ...options,
    executablePath: await chromium.executablePath(),
    args: [...chromium.args, ...(options.args ?? [])],
    headless: "shell",
  });
}
