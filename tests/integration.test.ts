/**
 * Integration tests against the real SendGrid API.
 * Skipped unless SENDGRID_API_KEY is set.
 *
 * Run with: SENDGRID_API_KEY=SG.xxx npm test
 */

import { SendGridClient } from "../src/client";

const apiKey = process.env.SENDGRID_API_KEY;
const hasApiKey = !!apiKey && apiKey.startsWith("SG.");

describe("integration (SendGrid API)", () => {
  if (!hasApiKey) {
    it("skips when SENDGRID_API_KEY is not set", () => {
      expect(process.env.SENDGRID_API_KEY).toBeFalsy();
    });
    return;
  }

  const client = new SendGridClient({ apiKey: apiKey! });

  it("sends a real email in sandbox mode", async () => {
    const result = await client.send({
      to: "test@example.com",
      from: process.env.SENDGRID_FROM_EMAIL ?? "test@example.com",
      subject: "Integration Test",
      text: "This is a test from mailweaver.",
      sandboxMode: true,
    });

    expect(result.statusCode).toBe(202);
  });
});
