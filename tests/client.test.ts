import { SendGridClient } from "../src/client";
import {
  ValidationError,
  SendGridError,
  ConfigurationError,
  EmailerError,
} from "../src/errors";
import { minimalValidOptions } from "./fixtures";
import type { Logger } from "../src/logger";

const mockFetch = jest.fn();

const createMockLogger = (): Logger & { calls: { level: string; message: string }[] } => {
  const calls: { level: string; message: string }[] = [];
  return {
    calls,
    debug: (msg) => { calls.push({ level: "debug", message: msg }); },
    info: (msg) => { calls.push({ level: "info", message: msg }); },
    warn: (msg) => { calls.push({ level: "warn", message: msg }); },
    error: (msg) => { calls.push({ level: "error", message: msg }); },
  };
};

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
});

describe("SendGridClient", () => {
  describe("constructor", () => {
    it("throws ConfigurationError when apiKey is missing", () => {
      expect(() => new SendGridClient({ apiKey: "" })).toThrow(ConfigurationError);
      expect(() => new SendGridClient({ apiKey: "" as unknown as string })).toThrow(
        ConfigurationError
      );
    });

    it("throws ConfigurationError when apiKey is whitespace only", () => {
      expect(() => new SendGridClient({ apiKey: "   " })).toThrow(ConfigurationError);
    });

    it("throws ConfigurationError when timeoutMs is invalid", () => {
      expect(
        () => new SendGridClient({ apiKey: "key", timeoutMs: 0 })
      ).toThrow(ConfigurationError);
      expect(
        () => new SendGridClient({ apiKey: "key", timeoutMs: -100 })
      ).toThrow(ConfigurationError);
    });

    it("accepts valid config with timeoutMs", () => {
      const client = new SendGridClient({
        apiKey: "test-key",
        timeoutMs: 10000,
      });
      expect(client).toBeInstanceOf(SendGridClient);
    });

    it("accepts valid config", () => {
      const client = new SendGridClient({
        apiKey: "test-key",
        baseUrl: "https://api.eu.sendgrid.com",
      });
      expect(client).toBeInstanceOf(SendGridClient);
    });
  });

  describe("send", () => {
    it("sends minimal valid email", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 202,
        headers: new Headers(),
      });

      const client = new SendGridClient({ apiKey: "test-key" });
      const result = await client.send(minimalValidOptions);

      expect(result.statusCode).toBe(202);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.from).toEqual({ email: "sender@example.com" });
      expect(body.personalizations[0].to).toEqual([
        { email: "recipient@example.com" },
      ]);
      expect(body.personalizations[0].subject).toBe("Test");
      expect(body.content).toEqual([{ type: "text/plain", value: "Hello" }]);
    });

    it("sends with string to and from", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 202,
        headers: new Headers(),
      });

      const client = new SendGridClient({ apiKey: "test-key" });
      await client.send({
        to: "user@example.com",
        from: "noreply@example.com",
        subject: "Hi",
        html: "<p>Hello</p>",
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.from).toEqual({ email: "noreply@example.com" });
      expect(body.personalizations[0].to).toEqual([{ email: "user@example.com" }]);
      expect(body.content).toContainEqual({
        type: "text/html",
        value: "<p>Hello</p>",
      });
    });

    it("sends with template and dynamic data", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 202,
        headers: new Headers(),
      });

      const client = new SendGridClient({ apiKey: "test-key" });
      await client.send({
        to: "user@example.com",
        from: "noreply@example.com",
        templateId: "d-xxx",
        dynamicTemplateData: { name: "Alice", orderId: "123" },
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.template_id).toBe("d-xxx");
      expect(body.personalizations[0].dynamic_template_data).toEqual({
        name: "Alice",
        orderId: "123",
      });
    });

    it("throws ValidationError for invalid from (Unicode)", async () => {
      const client = new SendGridClient({ apiKey: "test-key" });

      await expect(
        client.send({
          ...minimalValidOptions,
          from: { email: "noreply@example.com", name: "Tëst" },
        })
      ).rejects.toThrow(ValidationError);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("throws ValidationError for invalid email format", async () => {
      const client = new SendGridClient({ apiKey: "test-key" });

      await expect(
        client.send({
          ...minimalValidOptions,
          to: "invalid-email",
        })
      ).rejects.toThrow(ValidationError);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("propagates SendGridError from API", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers(),
        json: () =>
          Promise.resolve({
            errors: [{ message: "authorization required", field: null }],
          }),
      });

      const client = new SendGridClient({ apiKey: "bad-key" });

      await expect(client.send(minimalValidOptions)).rejects.toThrow(SendGridError);
      await expect(client.send(minimalValidOptions)).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it("propagates TransportError from network failures", async () => {
      mockFetch.mockRejectedValue(new Error("Network failure"));

      const client = new SendGridClient({ apiKey: "test-key" });

      const err = await client.send(minimalValidOptions).catch((e) => e);
      expect(err).toBeInstanceOf(EmailerError);
      expect(err.message).toContain("Network failure");
    });

    it("calls logger on success when provided", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 202,
        headers: new Headers(),
      });

      const mockLogger = createMockLogger();
      const client = new SendGridClient({
        apiKey: "test-key",
        logger: mockLogger,
      });

      await client.send(minimalValidOptions);

      expect(mockLogger.calls.some((c) => c.level === "info" && c.message.includes("succeeded"))).toBe(true);
    });

    it("calls logger on validation failure when provided", async () => {
      const mockLogger = createMockLogger();
      const client = new SendGridClient({
        apiKey: "test-key",
        logger: mockLogger,
      });

      await expect(
        client.send({
          ...minimalValidOptions,
          to: "invalid-email",
        })
      ).rejects.toThrow(ValidationError);

      expect(mockLogger.calls.some((c) => c.level === "warn" && c.message.includes("validation failed"))).toBe(true);
    });

    it("uses baseUrl from config", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 202,
        headers: new Headers(),
      });

      const client = new SendGridClient({
        apiKey: "test-key",
        baseUrl: "https://api.eu.sendgrid.com",
      });
      await client.send(minimalValidOptions);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.eu.sendgrid.com/v3/mail/send",
        expect.any(Object)
      );
    });
  });
});
