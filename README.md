# Emailer Library

A reusable TypeScript library for sending emails via the SendGrid v3 API. Includes input validation against SendGrid limits, full type safety, production-grade error handling, and structured logging.

## Installation

```bash
npm install @devboidesigns/emailer-library
```

**Requirements:** Node.js 18+ (uses native `fetch`)

## Quick Start

```typescript
import { SendGridClient } from "@devboidesigns/emailer-library";

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
import { SendGridClient, createConsoleLogger } from "@devboidesigns/emailer-library";

// From environment variable (recommended)
const client = new SendGridClient({ apiKey: process.env.SENDGRID_API_KEY! });

// With optional config
const clientWithOptions = new SendGridClient({
  apiKey: process.env.SENDGRID_API_KEY!,
  baseUrl: "https://api.eu.sendgrid.com",  // EU region
  timeoutMs: 10000,                         // Request timeout
  logger: createConsoleLogger({ minLevel: "info" }),  // Structured logging
});
```

Ensure your `from` address is a [verified sender](https://docs.sendgrid.com/ui/sending-email/sender-verification) in your SendGrid account.

### Test send (development)

When developing or cloning the repo, you can verify your SendGrid setup by sending a real test email:

```bash
SENDGRID_API_KEY=your_key SENDGRID_FROM_EMAIL=noreply@yourdomain.com npm run test:send -- recipient@example.com
```

Required environment variables:

| Variable | Description |
|----------|-------------|
| `SENDGRID_API_KEY` | Your SendGrid API key |
| `SENDGRID_FROM_EMAIL` | A verified sender address from your SendGrid account |

The `--` passes the recipient email to the script. You can also load env vars from `.env.local` or similar if your tooling supports it.

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

The library uses typed errors with error codes for programmatic handling. All errors extend `EmailerError` and include a `code` property.

### Error types

| Error | Code | When |
|-------|------|------|
| `ValidationError` | `VALIDATION_ERROR` | Input violates SendGrid limits or format rules |
| `ConfigurationError` | `CONFIGURATION_ERROR` | Invalid client config (e.g. missing apiKey) |
| `SendGridError` | `SENDGRID_API_ERROR` | SendGrid API returns 4xx/5xx |
| `TransportError` | `NETWORK_ERROR` | Network failure (DNS, connection refused) |
| `TimeoutError` | `TIMEOUT_ERROR` | Request timed out |
| `SerializationError` | `SERIALIZATION_ERROR` | Request body could not be serialized to JSON |

### ValidationError

Thrown before the request is sent:

```typescript
import { SendGridClient, ValidationError } from "@devboidesigns/emailer-library";

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

### SendGridError and retries

Thrown when the SendGrid API returns an error. Use `isRetryable()` and `getRetryAfterMs()` for retry logic:

```typescript
import { SendGridClient, SendGridError } from "@devboidesigns/emailer-library";

try {
  await client.send(options);
} catch (err) {
  if (err instanceof SendGridError) {
    console.error("API error:", err.statusCode, err.errors);
    if (err.isRetryable()) {
      const delayMs = err.getRetryAfterMs();  // For 429: uses rate limit reset
      if (delayMs) setTimeout(() => retry(), delayMs);
    }
  }
}
```

`isRetryable()` returns `true` for 429, 5xx, and 408. `getRetryAfterMs()` returns a suggested delay for 429 when rate limit headers are present.

### Rate limits

On `429 Too Many Requests`, the error includes `rateLimit` with `limit`, `remaining`, and `reset` (Unix timestamp):

```typescript
if (err instanceof SendGridError && err.rateLimit) {
  console.log(`Limit: ${err.rateLimit.limit}, remaining: ${err.rateLimit.remaining}`);
  console.log(`Resets at: ${new Date(err.rateLimit.reset * 1000)}`);
}
```

### Error serialization

All errors implement `toJSON()` for logging and monitoring:

```typescript
catch (err) {
  if (EmailerError.isEmailerError(err)) {
    console.error(JSON.stringify(err.toJSON()));
  }
}
```

## Logging

Pass a `logger` to enable structured, PII-safe logging. Logs are JSON-formatted and never include API keys, email content, or full addresses.

### Built-in console logger

```typescript
import { SendGridClient, createConsoleLogger } from "@devboidesigns/emailer-library";

const client = new SendGridClient({
  apiKey: process.env.SENDGRID_API_KEY!,
  logger: createConsoleLogger({
    minLevel: "info",   // "debug" | "info" | "warn" | "error"
    prefix: "[emailer]",
  }),
});
```

### Custom logger

Implement the `Logger` interface to integrate with pino, winston, or your logging infrastructure:

```typescript
import type { Logger, LogContext } from "@devboidesigns/emailer-library";

const myLogger: Logger = {
  debug: (msg, ctx) => log.debug(ctx, msg),
  info: (msg, ctx) => log.info(ctx, msg),
  warn: (msg, ctx) => log.warn(ctx, msg),
  error: (msg, ctx) => log.error(ctx, msg),
  child: (ctx) => myLogger.child ? myLogger.child(ctx) : myLogger,
};

const client = new SendGridClient({ apiKey: "...", logger: myLogger });
```

### What gets logged

- **debug**: Validation start, request start (recipient count, template usage)
- **info**: Send succeeded (status code, rate limit)
- **warn**: Validation failures
- **error**: Send failed, API errors, network/timeout errors

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
const client = new SendGridClient(config: {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  logger?: Logger;
});
```

| Config | Type | Description |
|--------|------|-------------|
| `apiKey` | `string` | SendGrid API key (required) |
| `baseUrl` | `string` | Override API base URL (e.g. EU region) |
| `timeoutMs` | `number` | Request timeout in milliseconds |
| `logger` | `Logger` | Optional structured logger |

#### send(options: SendEmailOptions): Promise<SendResponse>

Sends an email. Returns `{ statusCode, headers, rateLimit? }` on success.

### Error classes and codes

- `ErrorCode` – Constants: `VALIDATION_ERROR`, `CONFIGURATION_ERROR`, `SENDGRID_API_ERROR`, `NETWORK_ERROR`, `TIMEOUT_ERROR`, `SERIALIZATION_ERROR`, `UNKNOWN_ERROR`
- `EmailerError` – Base class; use `isEmailerError()` and `toJSON()`
- `ValidationError` – Pre-send validation failures
- `ConfigurationError` – Invalid client config
- `SendGridError` – API errors; `isRetryable()`, `getRetryAfterMs()`
- `TransportError` – Network failures
- `TimeoutError` – Request timeout
- `SerializationError` – JSON serialization failure

### Logger utilities

- `createConsoleLogger(options?)` – JSON logger for console
- `noopLogger` – No-op logger (default when none provided)
- `redactEmail(email)` – Redact email for safe logging
- `createRequestId()` – Generate request correlation ID

### Types

- `SendEmailOptions` – All options for a single send
- `EmailAddress` – `{ email: string; name?: string }`
- `Attachment` – `{ content: string; filename: string; type?: string; disposition?: "inline" | "attachment"; content_id?: string }`
- `SendResponse` – `{ statusCode: number; headers: Record<string, string>; rateLimit?: RateLimitInfo }`
- `Logger` – `{ debug, info, warn, error, child? }`

## License

ISC
