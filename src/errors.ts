import type { RateLimitInfo, SendGridErrorDetail } from "./types";

/** Error codes for programmatic handling and logging */
export const ErrorCode = {
  VALIDATION: "VALIDATION_ERROR",
  CONFIGURATION: "CONFIGURATION_ERROR",
  SENDGRID_API: "SENDGRID_API_ERROR",
  NETWORK: "NETWORK_ERROR",
  TIMEOUT: "TIMEOUT_ERROR",
  SERIALIZATION: "SERIALIZATION_ERROR",
  UNKNOWN: "UNKNOWN_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Base error for all emailer library errors */
export class EmailerError extends Error {
  override readonly name: string = "EmailerError";
  readonly code: ErrorCode;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN,
    options?: ErrorOptions
  ) {
    super(message, options);
    Object.setPrototypeOf(this, new.target.prototype);
    this.code = code;
    Error.captureStackTrace?.(this, this.constructor);
  }

  /** Serialize for logging/monitoring */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      stack: this.stack,
      cause: this.cause instanceof Error ? this.cause.message : this.cause,
    };
  }

  /** Check if this is a known emailer error */
  static isEmailerError(err: unknown): err is EmailerError {
    return err instanceof EmailerError;
  }
}

/**
 * Error for validation failures before the request is sent.
 */
export class ValidationError extends EmailerError {
  override readonly name = "ValidationError";
  readonly field?: string;

  constructor(
    message: string,
    field?: string,
    options?: ErrorOptions
  ) {
    super(message, ErrorCode.VALIDATION, options);
    Object.setPrototypeOf(this, ValidationError.prototype);
    this.field = field;
  }

  toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), field: this.field };
  }
}

/**
 * Error for invalid client configuration.
 */
export class ConfigurationError extends EmailerError {
  override readonly name = "ConfigurationError";
  readonly field?: string;

  constructor(
    message: string,
    field?: string,
    options?: ErrorOptions
  ) {
    super(message, ErrorCode.CONFIGURATION, options);
    Object.setPrototypeOf(this, ConfigurationError.prototype);
    this.field = field;
  }

  toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), field: this.field };
  }
}

/**
 * Error for network/transport failures (DNS, connection refused, etc.).
 */
export class TransportError extends EmailerError {
  override readonly name = "TransportError";

  constructor(
    message: string,
    options?: ErrorOptions
  ) {
    super(message, ErrorCode.NETWORK, options);
    Object.setPrototypeOf(this, TransportError.prototype);
  }
}

/**
 * Error when request times out.
 */
export class TimeoutError extends EmailerError {
  override readonly name = "TimeoutError";
  readonly timeoutMs: number;

  constructor(
    message: string,
    timeoutMs: number,
    options?: ErrorOptions
  ) {
    super(message, ErrorCode.TIMEOUT, options);
    Object.setPrototypeOf(this, TimeoutError.prototype);
    this.timeoutMs = timeoutMs;
  }

  toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), timeoutMs: this.timeoutMs };
  }
}

/**
 * Error when request body cannot be serialized.
 */
export class SerializationError extends EmailerError {
  override readonly name = "SerializationError";

  constructor(
    message: string,
    options?: ErrorOptions
  ) {
    super(message, ErrorCode.SERIALIZATION, options);
    Object.setPrototypeOf(this, SerializationError.prototype);
  }
}

/**
 * Error thrown when SendGrid API returns an error response.
 */
export class SendGridError extends EmailerError {
  override readonly name = "SendGridError";
  readonly statusCode: number;
  readonly errors: SendGridErrorDetail[];
  readonly rateLimit?: RateLimitInfo;

  constructor(
    message: string,
    statusCode: number,
    errors: SendGridErrorDetail[] = [],
    rateLimit?: RateLimitInfo,
    options?: ErrorOptions
  ) {
    super(message, ErrorCode.SENDGRID_API, options);
    Object.setPrototypeOf(this, SendGridError.prototype);
    this.statusCode = statusCode;
    this.errors = errors;
    this.rateLimit = rateLimit;
  }

  /**
   * Whether this error is likely transient and safe to retry.
   * - 429: Rate limited
   * - 5xx: Server errors
   * - 408: Request timeout
   */
  isRetryable(): boolean {
    if (this.statusCode === 429) return true;
    if (this.statusCode >= 500 && this.statusCode < 600) return true;
    if (this.statusCode === 408) return true;
    return false;
  }

  /**
   * Suggested retry delay in milliseconds (for 429).
   * Uses rate limit reset header if available.
   */
  getRetryAfterMs(): number | undefined {
    if (this.statusCode === 429 && this.rateLimit?.reset) {
      const nowSec = Math.floor(Date.now() / 1000);
      const waitSec = Math.max(0, this.rateLimit.reset - nowSec);
      return waitSec * 1000;
    }
    return undefined;
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      statusCode: this.statusCode,
      errors: this.errors,
      rateLimit: this.rateLimit,
      isRetryable: this.isRetryable(),
    };
  }
}
