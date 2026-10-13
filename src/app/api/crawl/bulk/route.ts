import { NextRequest } from "next/server";
import { POST as crawlPlatforms } from "../route";

/** Runs each configured platform sequentially through the shared crawler. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  const bulkRequest = new NextRequest(request.url, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...body, platform: "all" }),
  });
  return crawlPlatforms(bulkRequest);
}
