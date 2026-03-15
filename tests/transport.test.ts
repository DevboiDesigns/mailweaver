import { sendMail } from "../src/transport";
import {
  SendGridError,
  TransportError,
  TimeoutError,
  SerializationError,
} from "../src/errors";
import type { MailSendBody } from "../src/transport";

const mockFetch = jest.fn();

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
});

describe("sendMail", () => {
  const validBody: MailSendBody = {
    personalizations: [{ to: [{ email: "test@example.com" }] }],
    from: { email: "sender@example.com" },
    subject: "Test",
    content: [{ type: "text/plain", value: "Hello" }],
  };

  const config = { apiKey: "test-api-key" };

  it("sends POST request to correct URL", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 202,
      headers: new Headers(),
    });

    await sendMail(validBody, config);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.sendgrid.com/v3/mail/send",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-api-key",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(validBody),
      })
    );
  });

  it("uses custom baseUrl when provided", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 202,
      headers: new Headers(),
    });

    await sendMail(validBody, {
      ...config,
      baseUrl: "https://api.eu.sendgrid.com",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.eu.sendgrid.com/v3/mail/send",
      expect.any(Object)
    );
  });

  it("returns statusCode and headers on success", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 202,
      headers: new Headers({ "x-request-id": "abc123" }),
    });

    const result = await sendMail(validBody, config);

    expect(result).toEqual({
      statusCode: 202,
      headers: expect.objectContaining({
        "x-request-id": "abc123",
      }),
    });
  });

  it("parses rate limit headers on success", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 202,
      headers: new Headers({
        "x-ratelimit-limit": "500",
        "x-ratelimit-remaining": "499",
        "x-ratelimit-reset": "1392815263",
      }),
    });

    const result = await sendMail(validBody, config);

    expect(result.rateLimit).toEqual({
      limit: 500,
      remaining: 499,
      reset: 1392815263,
    });
  });

  it("throws SendGridError on 400", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers(),
      json: () =>
        Promise.resolve({
          errors: [{ message: "Invalid from address", field: "from" }],
        }),
    });

    await expect(sendMail(validBody, config)).rejects.toThrow(SendGridError);
    await expect(sendMail(validBody, config)).rejects.toMatchObject({
      statusCode: 400,
      errors: [{ message: "Invalid from address", field: "from" }],
    });
  });

  it("throws SendGridError on 429 with rate limit info", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({
        "x-ratelimit-limit": "150",
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "1392815263",
      }),
      json: () =>
        Promise.resolve({
          errors: [{ message: "too many requests", field: null }],
        }),
    });

    const err = await sendMail(validBody, config).catch((e) => e);

    expect(err).toBeInstanceOf(SendGridError);
    expect(err.statusCode).toBe(429);
    expect(err.rateLimit).toEqual({
      limit: 150,
      remaining: 0,
      reset: 1392815263,
    });
  });

  it("throws TransportError when fetch fails (network error)", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(sendMail(validBody, config)).rejects.toThrow(TransportError);
    await expect(sendMail(validBody, config)).rejects.toMatchObject({
      message: expect.stringContaining("ECONNREFUSED"),
    });
  });

  it("throws TimeoutError when request times out", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    mockFetch.mockRejectedValue(abortError);

    await expect(
      sendMail(validBody, { ...config, timeoutMs: 100 })
    ).rejects.toThrow(TimeoutError);
  });

  it("throws SerializationError when body cannot be serialized", async () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    const bodyWithCircular = {
      ...validBody,
      personalizations: circular,
    } as unknown as MailSendBody;

    await expect(sendMail(bodyWithCircular, config)).rejects.toThrow(
      SerializationError
    );
  });

  it("calls logger when provided", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 202,
      headers: new Headers(),
    });

    const logCalls: { level: string; message: string }[] = [];
    const mockLogger = {
      debug: (msg: string) => logCalls.push({ level: "debug", message: msg }),
      info: (msg: string) => logCalls.push({ level: "info", message: msg }),
      warn: (msg: string) => logCalls.push({ level: "warn", message: msg }),
      error: (msg: string) => logCalls.push({ level: "error", message: msg }),
    };

    await sendMail(validBody, { ...config, logger: mockLogger });

    expect(logCalls.some((c) => c.level === "info" && c.message.includes("succeeded"))).toBe(true);
  });

  it("throws TransportError when fetch rejects with non-Error", async () => {
    mockFetch.mockRejectedValue("string rejection");

    await expect(sendMail(validBody, config)).rejects.toThrow(TransportError);
    await expect(sendMail(validBody, config)).rejects.toMatchObject({
      message: expect.stringContaining("string rejection"),
    });
  });

  it("handles non-JSON error response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
      json: () => Promise.reject(new Error("Not JSON")),
    });

    await expect(sendMail(validBody, config)).rejects.toThrow(SendGridError);
    await expect(sendMail(validBody, config)).rejects.toMatchObject({
      statusCode: 500,
      errors: [],
    });
  });

  it("logs isRetryable: true for 408 (matches SendGridError.isRetryable)", async () => {
    const errorCalls: { message: string; context?: Record<string, unknown> }[] = [];
    const mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: (msg: string, ctx?: Record<string, unknown>) =>
        errorCalls.push({ message: msg, context: ctx }),
    };

    mockFetch.mockResolvedValue({
      ok: false,
      status: 408,
      headers: new Headers(),
      json: () =>
        Promise.resolve({
          errors: [{ message: "Request Timeout", field: null }],
        }),
    });

    const err = await sendMail(validBody, { ...config, logger: mockLogger }).catch(
      (e) => e
    );

    expect(err).toBeInstanceOf(SendGridError);
    expect(err.isRetryable()).toBe(true);
    const apiErrorLog = errorCalls.find((c) => c.message.includes("SendGrid API error"));
    expect(apiErrorLog?.context?.isRetryable).toBe(true);
  });

  it("logs isRetryable: false for 400 (matches SendGridError.isRetryable)", async () => {
    const errorCalls: { message: string; context?: Record<string, unknown> }[] = [];
    const mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: (msg: string, ctx?: Record<string, unknown>) =>
        errorCalls.push({ message: msg, context: ctx }),
    };

    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers(),
      json: () =>
        Promise.resolve({
          errors: [{ message: "Bad Request", field: null }],
        }),
    });

    await expect(
      sendMail(validBody, { ...config, logger: mockLogger })
    ).rejects.toThrow(SendGridError);

    const apiErrorLog = errorCalls.find((c) => c.message.includes("SendGrid API error"));
    expect(apiErrorLog?.context?.isRetryable).toBe(false);
  });
});
