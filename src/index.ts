/**
 * Public entrypoint for the emailer library.
 *
 * Consumers should import everything from the package root:
 *
 *   import { SendGridClient, type SendEmailOptions } from "@devboidesigns/emailer-library";
 *
 * This module re-exports the stable public API surface and is the only file
 * that will be considered part of the supported public contract.
 */
export { SendGridClient } from "./client";
export {
  type Logger,
  type LogLevel,
  type LogContext,
  noopLogger,
  createConsoleLogger,
  redactEmail,
  createRequestId,
} from "./logger";
export {
  ErrorCode,
  EmailerError,
  ValidationError,
  ConfigurationError,
  TransportError,
  TimeoutError,
  SerializationError,
  SendGridError,
} from "./errors";
export {
  SENDGRID_BASE_URL,
  SENDGRID_EU_BASE_URL,
  MAX_RECIPIENTS,
  MAX_PERSONALIZATIONS,
  MAX_EMAIL_SIZE_BYTES,
  MAX_CUSTOM_ARGS_BYTES,
  MAX_REPLY_TO_LIST,
  MAX_CATEGORIES,
  MAX_CATEGORY_LENGTH,
  MAX_SEND_AT_ADVANCE_SECONDS,
} from "./constants";
export type {
  SendGridConfig,
  SendEmailOptions,
  SendResponse,
  EmailAddress,
  Personalization,
  Content,
  Attachment,
  RateLimitInfo,
  SendGridErrorDetail,
} from "./types";
