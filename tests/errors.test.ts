import {
  ErrorCode,
  EmailerError,
  ValidationError,
  ConfigurationError,
  SendGridError,
  TransportError,
  TimeoutError,
} from "../src/errors";

describe("errors", () => {
  describe("EmailerError", () => {
    it("has code and message", () => {
      const err = new EmailerError("test", ErrorCode.UNKNOWN);
      expect(err.message).toBe("test");
      expect(err.code).toBe(ErrorCode.UNKNOWN);
      expect(err.name).toBe("EmailerError");
    });

    it("isEmailerError identifies emailer errors", () => {
      expect(EmailerError.isEmailerError(new ValidationError("x"))).toBe(true);
      expect(EmailerError.isEmailerError(new Error("x"))).toBe(false);
      expect(EmailerError.isEmailerError(null)).toBe(false);
    });

    it("toJSON serializes for logging", () => {
      const err = new EmailerError("test", ErrorCode.UNKNOWN);
      const json = err.toJSON();
      expect(json).toMatchObject({
        name: "EmailerError",
        message: "test",
        code: "UNKNOWN_ERROR",
      });
    });

    it("toJSON includes cause when provided", () => {
      const cause = new Error("root cause");
      const err = new EmailerError("wrapped", ErrorCode.UNKNOWN, { cause });
      const json = err.toJSON();
      expect(json.cause).toBe("root cause");
    });
  });

  describe("ValidationError", () => {
    it("includes field when provided", () => {
      const err = new ValidationError("Invalid email", "email");
      expect(err.field).toBe("email");
      expect(err.code).toBe(ErrorCode.VALIDATION);
    });

    it("toJSON includes field", () => {
      const err = new ValidationError("Invalid", "from");
      expect(err.toJSON()).toMatchObject({ field: "from" });
    });
  });

  describe("ConfigurationError", () => {
    it("includes field when provided", () => {
      const err = new ConfigurationError("Invalid apiKey", "apiKey");
      expect(err.field).toBe("apiKey");
      expect(err.code).toBe(ErrorCode.CONFIGURATION);
    });
  });

  describe("SendGridError", () => {
    it("isRetryable returns true for 429", () => {
      const err = new SendGridError("rate limited", 429);
      expect(err.isRetryable()).toBe(true);
    });

    it("isRetryable returns true for 5xx", () => {
      expect(new SendGridError("server error", 500).isRetryable()).toBe(true);
      expect(new SendGridError("gateway error", 502).isRetryable()).toBe(true);
      expect(new SendGridError("unavailable", 503).isRetryable()).toBe(true);
    });

    it("isRetryable returns true for 408", () => {
      expect(new SendGridError("timeout", 408).isRetryable()).toBe(true);
    });

    it("isRetryable returns false for 4xx (except 408, 429)", () => {
      expect(new SendGridError("bad request", 400).isRetryable()).toBe(false);
      expect(new SendGridError("unauthorized", 401).isRetryable()).toBe(false);
    });

    it("getRetryAfterMs returns delay for 429 with rate limit", () => {
      const futureReset = Math.floor(Date.now() / 1000) + 60;
      const err = new SendGridError("rate limited", 429, [], {
        limit: 100,
        remaining: 0,
        reset: futureReset,
      });
      const ms = err.getRetryAfterMs();
      expect(ms).toBeDefined();
      expect(ms!).toBeGreaterThan(50000);
      expect(ms!).toBeLessThanOrEqual(60000);
    });

    it("getRetryAfterMs returns undefined for non-429", () => {
      const err = new SendGridError("server error", 500);
      expect(err.getRetryAfterMs()).toBeUndefined();
    });
  });

  describe("TransportError", () => {
    it("preserves cause", () => {
      const cause = new Error("ECONNREFUSED");
      const err = new TransportError("Network failed", { cause });
      expect(err.cause).toBe(cause);
    });
  });

  describe("TimeoutError", () => {
    it("includes timeoutMs", () => {
      const err = new TimeoutError("Timed out", 5000);
      expect(err.timeoutMs).toBe(5000);
      expect(err.code).toBe(ErrorCode.TIMEOUT);
    });

    it("toJSON includes timeoutMs", () => {
      const err = new TimeoutError("Timed out", 3000);
      expect(err.toJSON()).toMatchObject({ timeoutMs: 3000 });
    });
  });

  describe("SerializationError", () => {
    it("has correct code", () => {
      const err = new SerializationError("Failed to serialize");
      expect(err.code).toBe(ErrorCode.SERIALIZATION);
    });
  });

  describe("SendGridError", () => {
    it("toJSON includes statusCode, errors, isRetryable", () => {
      const err = new SendGridError("API error", 500, [
        { message: "Internal error", field: null },
      ]);
      const json = err.toJSON();
      expect(json).toMatchObject({
        statusCode: 500,
        isRetryable: true,
      });
      expect(json.errors).toHaveLength(1);
    });

    it("getRetryAfterMs returns 0 when reset is in the past", () => {
      const pastReset = Math.floor(Date.now() / 1000) - 10;
      const err = new SendGridError("rate limited", 429, [], {
        limit: 100,
        remaining: 0,
        reset: pastReset,
      });
      expect(err.getRetryAfterMs()).toBe(0);
    });

    it("getRetryAfterMs returns undefined when rateLimit is missing", () => {
      const err = new SendGridError("rate limited", 429);
      expect(err.getRetryAfterMs()).toBeUndefined();
    });
  });
});
