import {
  SendGridError,
  TransportError,
  TimeoutError,
  SerializationError,
} from "./errors";
import type { RateLimitInfo, SendGridErrorDetail } from "./types";
import { SENDGRID_BASE_URL, MAIL_SEND_PATH } from "./constants";
import type { Logger } from "./logger";
import { noopLogger } from "./logger";
import { createRequestId } from "./logger";

/** Mail Send API request body (SendGrid v3 format) */
export interface MailSendBody {
  personalizations: Array<{
    to: Array<{ email: string; name?: string }>;
    cc?: Array<{ email: string; name?: string }>;
    bcc?: Array<{ email: string; name?: string }>;
    subject?: string;
    dynamic_template_data?: Record<string, unknown>;
    custom_args?: Record<string, string>;
    send_at?: number;
  }>;
  from: { email: string; name?: string };
  reply_to?: { email: string; name?: string };
  reply_to_list?: Array<{ email: string; name?: string }>;
  subject?: string;
  content?: Array<{ type: string; value: string }>;
  attachments?: Array<{
    content: string;
    filename: string;
    type?: string;
    disposition?: string;
    content_id?: string;
  }>;
  template_id?: string;
  categories?: string[];
  custom_args?: Record<string, string>;
  send_at?: number;
  asm?: { group_id: number; groups_to_display?: number[] };
  ip_pool_name?: string;
  mail_settings?: { sandbox_mode?: { enable: boolean } };
  [key: string]: unknown;
}

export interface TransportConfig {
  apiKey: string;
  baseUrl?: string;
  /** Request timeout in milliseconds. Default: no timeout. */
  timeoutMs?: number;
  /** Optional logger for structured logging. */
  logger?: Logger;
}

function parseRateLimitHeaders(headers: Headers): RateLimitInfo | undefined {
  const limit = headers.get("x-ratelimit-limit");
  const remaining = headers.get("x-ratelimit-remaining");
  const reset = headers.get("x-ratelimit-reset");
  if (limit && remaining && reset) {
    return {
      limit: parseInt(limit, 10),
      remaining: parseInt(remaining, 10),
      reset: parseInt(reset, 10),
    };
  }
  return undefined;
}

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

function createFetchBody(body: MailSendBody): string {
  try {
    return JSON.stringify(body);
  } catch (err) {
    const cause = err instanceof Error ? err : new Error(String(err));
    throw new SerializationError(
      "Failed to serialize request body to JSON",
      { cause }
    );
  }
}

/**
 * Send mail via SendGrid v3 API.
 */
export async function sendMail(
  body: MailSendBody,
  config: TransportConfig
): Promise<{ statusCode: number; headers: Record<string, string>; rateLimit?: RateLimitInfo }> {
  const logger = config.logger ?? noopLogger;
  const requestId = createRequestId();
  const log = logger.child ? logger.child({ requestId }) : logger;

  const baseUrl = config.baseUrl ?? SENDGRID_BASE_URL;
  const url = `${baseUrl}${MAIL_SEND_PATH}`;
  const timeoutMs = config.timeoutMs;

  const recipientCount = Array.isArray(body.personalizations)
    ? body.personalizations.reduce(
        (sum, p) => sum + (p.to?.length ?? 0) + (p.cc?.length ?? 0) + (p.bcc?.length ?? 0),
        0
      )
    : 0;

  log.debug("SendGrid request starting", {
    url: `${baseUrl}${MAIL_SEND_PATH}`,
    recipientCount,
    personalizationCount: body.personalizations.length,
    hasTemplate: !!body.template_id,
    timeoutMs: timeoutMs ?? null,
  });

  let bodyStr: string;
  try {
    bodyStr = createFetchBody(body);
  } catch (err) {
    log.error("Request body serialization failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    if (err instanceof SerializationError) throw err;
    throw new SerializationError("Failed to serialize request body", {
      cause: err instanceof Error ? err : undefined,
    });
  }

  const controller = timeoutMs ? new AbortController() : undefined;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : undefined;

  const fetchOptions: RequestInit = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: bodyStr,
    signal: controller?.signal,
  };

  let response: Response;
  try {
    response = await fetch(url, fetchOptions);
  } catch (err) {
    if (err instanceof Error) {
      if (err.name === "AbortError") {
        log.error("Request timed out", { timeoutMs: timeoutMs! });
        throw new TimeoutError(
          `Request timed out after ${timeoutMs}ms`,
          timeoutMs!,
          { cause: err }
        );
      }
      log.error("Network request failed", {
        error: err.message,
        errorName: err.name,
      });
      throw new TransportError(
        `Network request failed: ${err.message}`,
        { cause: err }
      );
    }
    log.error("Network request failed", { error: String(err) });
    throw new TransportError(`Network request failed: ${String(err)}`, {
      cause: err instanceof Error ? err : undefined,
    });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  const responseHeaders = headersToRecord(response.headers);
  const rateLimit = parseRateLimitHeaders(response.headers);

  if (response.ok) {
    log.info("SendGrid request succeeded", {
      statusCode: response.status,
      rateLimitRemaining: rateLimit?.remaining,
      rateLimitReset: rateLimit?.reset,
    });
    return {
      statusCode: response.status,
      headers: responseHeaders,
      rateLimit,
    };
  }

  let errors: SendGridErrorDetail[] = [];
  try {
    const json = (await response.json()) as { errors?: SendGridErrorDetail[] };
    if (json.errors && Array.isArray(json.errors)) {
      errors = json.errors;
    }
  } catch {
    // Response body may not be JSON
  }

  const errorMessages = errors.map((e) => e.message).join("; ");
  const message =
    errorMessages || `SendGrid API error: ${response.status} ${response.statusText}`;

  log.error("SendGrid API error", {
    statusCode: response.status,
    errorSummary: errors.map((e) => e.message).join("; "),
    rateLimitRemaining: rateLimit?.remaining,
    isRetryable: response.status === 429 || (response.status >= 500 && response.status < 600),
  });

  throw new SendGridError(
    message,
    response.status,
    errors,
    rateLimit
  );
}
