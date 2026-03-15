# Emailer Library

A reusable TypeScript library for sending emails via the SendGrid v3 API. Includes input validation against SendGrid limits, full type safety, and clear error handling.

## Installation

```bash
npm install emailer-library
```

**Requirements:** Node.js 18+ (uses native `fetch`)

## Quick Start

```typescript
import { SendGridClient } from "emailer-library";

const client = new SendGridClient({ apiKey: process.env.SENDGRID_API_KEY! });
await client.send({
  to: "recipient@example.com",
  from: "noreply@example.com",
  subject: "Hello",
  text: "Plain text body",
  html: "<p>HTML body</p>",
});
```

## Setup

Create a SendGrid API key from the [SendGrid dashboard](https://app.sendgrid.com/settings/api_keys) and pass it to the client:

```typescript
// From environment variable (recommended)
const client = new SendGridClient({ apiKey: process.env.SENDGRID_API_KEY! });

// Or directly
const client = new SendGridClient({ apiKey: "SG.xxx" });
```

Ensure your `from` address is a [verified sender](https://docs.sendgrid.com/ui/sending-email/sender-verification) in your SendGrid account.

## Basic Usage

### Simple send (string addresses)

```typescript
await client.send({
  to: "user@example.com",
  from: "noreply@example.com",
  subject: "Welcome",
  text: "Thanks for signing up!",
});
```

### HTML and plain text

```typescript
await client.send({
  to: "user@example.com",
  from: "noreply@example.com",
  subject: "Order Confirmation",
  text: "Your order #123 has been confirmed.",
  html: "<p>Your order <strong>#123</strong> has been confirmed.</p>",
});
```

### Named sender and recipients

```typescript
await client.send({
  to: [{ email: "user@example.com", name: "Alice" }],
  from: { email: "orders@example.com", name: "Example Store" },
  subject: "Your Order",
  html: "<p>Hello Alice!</p>",
});
```

## Advanced Usage

### CC and BCC

```typescript
await client.send({
  to: "primary@example.com",
  cc: ["manager@example.com"],
  bcc: [{ email: "archive@example.com", name: "Archive" }],
  from: "noreply@example.com",
  subject: "Report",
  text: "See attached.",
});
```

### Dynamic templates

```typescript
await client.send({
  to: "user@example.com",
  from: "noreply@example.com",
  templateId: "d-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  dynamicTemplateData: {
    customerName: "Alice",
    orderId: "12345",
    items: ["Item A", "Item B"],
  },
});
```

### Attachments

```typescript
import { readFileSync } from "fs";

const pdf = readFileSync("invoice.pdf").toString("base64");

await client.send({
  to: "user@example.com",
  from: "noreply@example.com",
  subject: "Your Invoice",
  text: "Please find your invoice attached.",
  attachments: [
    {
      content: pdf,
      filename: "invoice.pdf",
      type: "application/pdf",
    },
  ],
});
```

### Scheduled send

```typescript
// Send 1 hour from now (max 72 hours ahead)
const sendAt = Math.floor(Date.now() / 1000) + 3600;

await client.send({
  to: "user@example.com",
  from: "noreply@example.com",
  subject: "Reminder",
  text: "Don't forget!",
  sendAt,
});
```

### Sandbox mode

Validate your request without actually sending:

```typescript
await client.send({
  to: "user@example.com",
  from: "noreply@example.com",
  subject: "Test",
  text: "This won't be delivered",
  sandboxMode: true,
});
```

## Error Handling

### ValidationError

Thrown before the request is sent when input violates SendGrid limits or format rules:

```typescript
import { SendGridClient, ValidationError } from "emailer-library";

try {
  await client.send({
    to: "invalid-email",
    from: "noreply@example.com",
    subject: "Test",
    text: "Hello",
  });
} catch (err) {
  if (err instanceof ValidationError) {
    console.error("Validation failed:", err.message, err.field);
  }
}
```

### SendGridError

Thrown when the SendGrid API returns an error (4xx, 5xx):

```typescript
import { SendGridClient, SendGridError } from "emailer-library";

try {
  await client.send(options);
} catch (err) {
  if (err instanceof SendGridError) {
    console.error("API error:", err.statusCode, err.errors);
    if (err.statusCode === 429) {
      console.log("Rate limit:", err.rateLimit);
    }
  }
}
```

### Rate limits

On `429 Too Many Requests`, the error includes `rateLimit` with `limit`, `remaining`, and `reset` (Unix timestamp):

```typescript
if (err instanceof SendGridError && err.rateLimit) {
  console.log(`Limit: ${err.rateLimit.limit}, remaining: ${err.rateLimit.remaining}`);
  console.log(`Resets at: ${new Date(err.rateLimit.reset * 1000)}`);
}
```

## EU Region

For EU regional subusers, use the EU base URL:

```typescript
const client = new SendGridClient({
  apiKey: process.env.SENDGRID_API_KEY!,
  baseUrl: "https://api.eu.sendgrid.com",
});
```

## Limitations

This library enforces [SendGrid's documented limits](https://docs.sendgrid.com/api-reference/mail-send/limitations):

| Constraint | Limit |
|------------|-------|
| Recipients (to + cc + bcc) | Max 1,000 per request |
| Personalizations | Max 1,000 per request |
| Total email size | Max 30MB |
| Custom args | Max 10,000 bytes |
| Reply-to list | Max 1,000 addresses |
| Categories | Max 10, each max 255 chars |
| Scheduled send | Max 72 hours in advance |
| From field | ASCII only (no Unicode) |

See [docs/LIMITATIONS.md](docs/LIMITATIONS.md) for details.

## API Reference

### SendGridClient

```typescript
const client = new SendGridClient(config: { apiKey: string; baseUrl?: string });
```

#### send(options: SendEmailOptions): Promise<SendResponse>

Sends an email. Returns `{ statusCode, headers, rateLimit? }` on success.

### Types

- `SendEmailOptions` – All options for a single send
- `EmailAddress` – `{ email: string; name?: string }`
- `Attachment` – `{ content: string; filename: string; type?: string; disposition?: "inline" | "attachment"; content_id?: string }`
- `SendResponse` – `{ statusCode: number; headers: Record<string, string>; rateLimit?: RateLimitInfo }`

## License

ISC
