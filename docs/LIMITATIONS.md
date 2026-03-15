# SendGrid Limitations

This document describes the limits enforced by the emailer-library based on [SendGrid's official Mail Send API documentation](https://docs.sendgrid.com/api-reference/mail-send/limitations).

## Summary Table

| Constraint | Limit | Enforcement |
|------------|-------|-------------|
| Recipients (to + cc + bcc) | Max 1,000 per request | Pre-send validation |
| Personalizations | Max 1,000 per request | Pre-send validation |
| Total email size | Max 30MB | Pre-send validation |
| Custom args | Max 10,000 bytes total | Pre-send validation |
| Reply-to list | Max 1,000 addresses | Pre-send validation |
| Categories | Max 10, each max 255 chars | Pre-send validation |
| Scheduled send | Max 72 hours in advance | Pre-send validation |
| From field | ASCII only (no Unicode) | Pre-send validation |

## Detailed Limits

### Recipients

The total number of recipients across a single API request is limited to **1,000**. This includes all recipients in `to`, `cc`, and `bcc` across every personalization.

**Example:** If you have 2 personalizations with 500 `to` addresses each, you've reached the limit.

### Personalizations

You can include at most **1,000 personalizations** per request. Each personalization defines a recipient group and optional per-recipient data (subject, dynamic template data, etc.).

For more than 1,000 recipients with different content, make multiple API requests.

### Total Email Size

The maximum total email size (headers + body + attachments) is **30MB**. The library estimates payload size before sending and throws `ValidationError` if it exceeds this limit.

### Custom Arguments

Custom arguments (`custom_args`) must total less than **10,000 bytes** when serialized to JSON. Use custom args for tracking data that travels with the email; avoid storing large payloads.

### Reply-To List

The `reply_to_list` parameter allows up to **1,000** email addresses. You cannot use both `reply_to` and `reply_to_list` in the same request.

### Categories

- Maximum **10** categories per email
- Each category name: maximum **255** characters

### Scheduled Send

The `send_at` Unix timestamp cannot be more than **72 hours** in the future. For longer delays, schedule via a job queue or cron.

### From Field

SendGrid does not support Unicode in the `from` email address or name. Use ASCII characters only. The library validates this and throws `ValidationError` for non-ASCII characters.

## Rate Limits

SendGrid applies rate limits per endpoint. When you exceed the limit, the API returns `429 Too Many Requests` with headers:

- `X-RateLimit-Limit` – Maximum requests per period
- `X-RateLimit-Remaining` – Requests remaining
- `X-RateLimit-Reset` – Unix timestamp when the limit resets

The library surfaces this in `SendGridError.rateLimit` when a 429 is received. Use `err.isRetryable()` to check if the error is transient (429, 5xx, 408) and `err.getRetryAfterMs()` to get a suggested retry delay for rate-limited requests.

## Official Documentation

- [Mail Send Limitations](https://docs.sendgrid.com/api-reference/mail-send/limitations)
- [Rate Limits](https://docs.sendgrid.com/api-reference/how-to-use-the-sendgrid-v3-api/rate-limits)
- [Mail Send Errors](https://docs.sendgrid.com/api-reference/mail-send/errors)
