/**
 * Production-grade logging for the emailer library.
 * Structured, PII-safe, and pluggable.
 */

/** Log levels in order of severity */
export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** Structured log context - never include API keys, email content, or full addresses */
export interface LogContext {
  [key: string]: string | number | boolean | undefined | null;
}

/**
 * Logger interface for production use.
 * Implement this to integrate with pino, winston, or your logging infrastructure.
 */
export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  /** Create a child logger with bound context (e.g. requestId) */
  child?(context: LogContext): Logger;
}

function shouldLog(minLevel: LogLevel, level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[minLevel];
}

/**
 * No-op logger. Used when no logger is provided.
 */
export const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Create a console logger that outputs structured JSON.
 * Suitable for production when logs are ingested by log aggregators.
 */
export function createConsoleLogger(options?: {
  minLevel?: LogLevel;
  /** Prefix for log lines (e.g. "[emailer]") */
  prefix?: string;
}): Logger {
  const minLevel = options?.minLevel ?? "info";
  const prefix = options?.prefix ?? "[emailer]";

  function log(level: LogLevel, message: string, context?: LogContext): void {
    if (!shouldLog(minLevel, level)) return;

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message: prefix ? `${prefix} ${message}` : message,
      ...context,
    };

    const line = JSON.stringify(entry);

    switch (level) {
      case "debug":
        console.debug(line);
        break;
      case "info":
        console.info(line);
        break;
      case "warn":
        console.warn(line);
        break;
      case "error":
        console.error(line);
        break;
    }
  }

  const base: Logger = {
    debug: (msg, ctx) => log("debug", msg, ctx),
    info: (msg, ctx) => log("info", msg, ctx),
    warn: (msg, ctx) => log("warn", msg, ctx),
    error: (msg, ctx) => log("error", msg, ctx),
    child: (boundContext) => ({
      debug: (msg, ctx) => base.debug(msg, { ...boundContext, ...ctx }),
      info: (msg, ctx) => base.info(msg, { ...boundContext, ...ctx }),
      warn: (msg, ctx) => base.warn(msg, { ...boundContext, ...ctx }),
      error: (msg, ctx) => base.error(msg, { ...boundContext, ...ctx }),
    }),
  };

  return base;
}

/**
 * Redact email for safe logging - show only domain.
 */
export function redactEmail(email: string): string {
  const at = email.indexOf("@");
  if (at === -1) return "[redacted]";
  return `***@${email.slice(at + 1)}`;
}

/**
 * Generate a short request ID for correlation.
 */
export function createRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
