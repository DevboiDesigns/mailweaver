/**
 * Type definitions for the SendGrid email library.
 */

import type { Logger } from "./logger";

/** Email address with optional display name */
export interface EmailAddress {
  email: string;
  name?: string;
}

/** Single personalization (recipient group) for the Mail Send API */
export interface Personalization {
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject?: string;
  dynamic_template_data?: Record<string, unknown>;
  custom_args?: Record<string, string>;
  send_at?: number;
}

/** Email content (plain text or HTML) */
export interface Content {
  type: "text/plain" | "text/html";
  value: string;
}

/** Email attachment */
export interface Attachment {
  content: string; // Base64 encoded
  filename: string;
  type?: string;
  disposition?: "inline" | "attachment";
  content_id?: string;
}

/** SendGrid client configuration */
export interface SendGridConfig {
  apiKey: string;
  baseUrl?: string;
  /** Request timeout in milliseconds. Default: no timeout. */
  timeoutMs?: number;
  /** Optional logger for structured production logging. */
  logger?: Logger;
}

/** Options for sending a single or batch email */
export interface SendEmailOptions {
  /** Recipient(s) - string or array of EmailAddress */
  to: string | EmailAddress | EmailAddress[];
  /** Sender - required */
  from: string | EmailAddress;
  /** Email subject */
  subject?: string;
  /** Plain text body */
  text?: string;
  /** HTML body */
  html?: string;
  /** CC recipients */
  cc?: string | EmailAddress | EmailAddress[];
  /** BCC recipients */
  bcc?: string | EmailAddress | EmailAddress[];
  /** SendGrid dynamic template ID (e.g. d-xxx) */
  templateId?: string;
  /** Data for dynamic template substitution */
  dynamicTemplateData?: Record<string, unknown>;
  /** Attachments */
  attachments?: Attachment[];
  /** Reply-to address */
  replyTo?: string | EmailAddress;
  /** Reply-to list (mutually exclusive with replyTo) */
  replyToList?: EmailAddress[];
  /** Categories for tracking */
  categories?: string[];
  /** Custom arguments (max 10,000 bytes total) */
  customArgs?: Record<string, string>;
  /** Unix timestamp for scheduled send (max 72 hours ahead) */
  sendAt?: number;
  /** Unsubscribe group ID */
  asmGroupId?: number;
  /** Unsubscribe groups to display */
  asmGroupsToDisplay?: number[];
  /** IP pool name */
  ipPoolName?: string;
  /** Sandbox mode - validate without sending */
  sandboxMode?: boolean;
  /** Personalizations for batch/advanced sends */
  personalizations?: Personalization[];
}

/** Rate limit info from SendGrid response headers */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp
}

/** Response from successful send */
export interface SendResponse {
  statusCode: number;
  headers: Record<string, string>;
  rateLimit?: RateLimitInfo;
}

/** SendGrid API error detail */
export interface SendGridErrorDetail {
  message: string;
  field?: string | null;
  help?: Record<string, unknown>;
}
