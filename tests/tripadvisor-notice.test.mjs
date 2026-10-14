import assert from "node:assert/strict";
import test from "node:test";
import { extractTripadvisorNotice } from "../src/lib/scraper/tripadvisor-notice.ts";

test("extracts the complete Vietnamese notice from Markdown", () => {
  const markdown = `Sontra Sea Hotel

Thư từ Tripadvisor: • Tripadvisor có cơ sở để điều tra rằng những cá nhân hoặc tổ chức liên kết với cơ sở
kinh doanh này có thể đã can thiệp vào các đánh giá của khách du lịch.
Hãy cân nhắc điều này khi nghiên cứu kế hoạch du lịch của bạn.

# Sontra Sea Hotel`;
  assert.equal(extractTripadvisorNotice(markdown),
    "• Tripadvisor có cơ sở để điều tra rằng những cá nhân hoặc tổ chức liên kết với cơ sở kinh doanh này có thể đã can thiệp vào các đánh giá của khách du lịch. Hãy cân nhắc điều này khi nghiên cứu kế hoạch du lịch của bạn.");
});

test("returns null when Tripadvisor did not publish a notice", () => {
  assert.equal(extractTripadvisorNotice("# Hotel\n4,5 trên 5 bong bóng\n100 đánh giá"), null);
});
