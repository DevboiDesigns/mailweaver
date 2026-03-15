/**
 * Test script to send a real email via SendGrid.
 *
 * Usage:
 *   SENDGRID_API_KEY=your_key SENDGRID_FROM_EMAIL=noreply@example.com npm run test:send -- user@example.com
 *
 * Required env vars:
 *   SENDGRID_API_KEY  - Your SendGrid API key
 *   SENDGRID_FROM_EMAIL - Verified sender address (must be verified in SendGrid)
 */

import { SendGridClient, createConsoleLogger } from "../src/index";

const toEmail = process.argv[2];
const apiKey = process.env.SENDGRID_API_KEY;
const fromEmail = process.env.SENDGRID_FROM_EMAIL;

if (!toEmail) {
  console.error("Usage: npm run test:send -- <email@example.com>");
  console.error("  The email argument is the recipient address.");
  process.exit(1);
}

if (!apiKey) {
  console.error("Error: SENDGRID_API_KEY environment variable is required.");
  process.exit(1);
}

if (!fromEmail) {
  console.error("Error: SENDGRID_FROM_EMAIL environment variable is required.");
  console.error("  Use a verified sender address from your SendGrid account.");
  process.exit(1);
}

async function main() {
  const client = new SendGridClient({
    apiKey: apiKey!,
    logger: createConsoleLogger({ minLevel: "info", prefix: "[test-send]" }),
  });

  console.log(`Sending test email to ${toEmail}...`);

  try {
    const result = await client.send({
      to: toEmail,
      from: fromEmail!,
      subject: "Mailweaver – Test Email",
      text: "This is a test email from mailweaver. If you received this, your SendGrid setup is working correctly.",
      html: "<p>This is a test email from <strong>mailweaver</strong>.</p><p>If you received this, your SendGrid setup is working correctly.</p>",
    });

    console.log(`✓ Email sent successfully (status: ${result.statusCode})`);
  } catch (err) {
    console.error(
      "✗ Failed to send email:",
      err instanceof Error ? err.message : err
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(
    "✗ Unexpected failure before send:",
    err instanceof Error ? err.message : err
  );
  process.exit(1);
});
