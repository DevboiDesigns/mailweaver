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
const mockSendMail = jest.fn();
const originalFetch = global.fetch;

jest.mock("../src/transport", () => ({
  sendMail: (...args: unknown[]) => mockSendMail(...args),
}));

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
  mockSendMail.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
  // Default: delegate to real fetch for most tests
  mockSendMail.mockImplementation(async (body: unknown, config: { apiKey: string; baseUrl?: string; timeoutMs?: number; logger?: unknown }) => {
    const { sendMail } = jest.requireActual("../src/transport");
    return sendMail(body, { ...config, logger: config.logger });
  });
});

afterEach(() => {
  global.fetch = originalFetch;
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

    it("sends with cc, bcc, sendAt, customArgs in default personalization", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 202,
        headers: new Headers(),
      });

      const sendAt = Math.floor(Date.now() / 1000) + 3600;
      const client = new SendGridClient({ apiKey: "test-key" });
      await client.send({
        to: "user@example.com",
        from: "noreply@example.com",
        subject: "Test",
        text: "Hello",
        cc: "cc@example.com",
        bcc: "bcc@example.com",
        sendAt,
        customArgs: { tracking: "abc" },
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.personalizations[0].cc).toEqual([{ email: "cc@example.com" }]);
      expect(body.personalizations[0].bcc).toEqual([{ email: "bcc@example.com" }]);
      expect(body.personalizations[0].send_at).toBe(sendAt);
      expect(body.personalizations[0].custom_args).toEqual({ tracking: "abc" });
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

    it("throws ValidationError for invalid address object in to list", async () => {
      const client = new SendGridClient({ apiKey: "test-key" });

      await expect(
        client.send({
          ...minimalValidOptions,
          to: [{ email: "a@example.com" }, 123 as unknown as { email: string }],
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

    it("sends with personalizations, replyTo, attachments, categories", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 202,
        headers: new Headers(),
      });

      const client = new SendGridClient({ apiKey: "test-key" });
      await client.send({
        to: "fallback@example.com", // Required by type when using personalizations
        personalizations: [
          { to: [{ email: "a@example.com" }], subject: "Hi A" },
          { to: [{ email: "b@example.com" }], subject: "Hi B" },
        ],
        from: "noreply@example.com",
        replyTo: "reply@example.com",
        attachments: [
          { content: "base64content", filename: "doc.pdf", type: "application/pdf" },
        ],
        categories: ["transactional"],
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.personalizations).toHaveLength(2);
      expect(body.personalizations[0].subject).toBe("Hi A");
      expect(body.reply_to).toEqual({ email: "reply@example.com" });
      expect(body.attachments).toHaveLength(1);
      expect(body.attachments[0].filename).toBe("doc.pdf");
      expect(body.categories).toEqual(["transactional"]);
    });

    it("sends with attachment disposition and content_id", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 202,
        headers: new Headers(),
      });

      const client = new SendGridClient({ apiKey: "test-key" });
      await client.send({
        to: "user@example.com",
        from: "noreply@example.com",
        subject: "Inline",
        html: '<p>See <img src="cid:logo"></p>',
        attachments: [
          {
            content: "base64",
            filename: "logo.png",
            type: "image/png",
            disposition: "inline",
            content_id: "logo",
          },
        ],
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.attachments[0]).toMatchObject({
        disposition: "inline",
        content_id: "logo",
      });
    });

    it("sends with replyToList", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 202,
        headers: new Headers(),
      });

      const client = new SendGridClient({ apiKey: "test-key" });
      await client.send({
        to: "user@example.com",
        from: "noreply@example.com",
        subject: "Test",
        text: "Hi",
        replyToList: [
          { email: "r1@example.com" },
          { email: "r2@example.com", name: "R2" },
        ],
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.reply_to_list).toEqual([
        { email: "r1@example.com" },
        { email: "r2@example.com", name: "R2" },
      ]);
    });

    it("sends with asm, ipPoolName, sandboxMode", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 202,
        headers: new Headers(),
      });

      const client = new SendGridClient({ apiKey: "test-key" });
      await client.send({
        to: "user@example.com",
        from: "noreply@example.com",
        subject: "Test",
        text: "Hi",
        asmGroupId: 123,
        asmGroupsToDisplay: [123, 456],
        ipPoolName: "pool1",
        sandboxMode: true,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.asm).toEqual({ group_id: 123, groups_to_display: [123, 456] });
      expect(body.ip_pool_name).toBe("pool1");
      expect(body.mail_settings).toEqual({ sandbox_mode: { enable: true } });
    });

    it("throws ConfigurationError when apiKey is not a string", () => {
      expect(() =>
        new SendGridClient({ apiKey: null as unknown as string })
      ).toThrow(ConfigurationError);
      expect(() =>
        new SendGridClient({ apiKey: 123 as unknown as string })
      ).toThrow(ConfigurationError);
    });

    it("wraps non-Error throws as EmailerError", async () => {
      mockSendMail.mockRejectedValue("string error");

      const client = new SendGridClient({ apiKey: "test-key" });
      const err = await client.send(minimalValidOptions).catch((e) => e);

      expect(err).toBeInstanceOf(EmailerError);
      expect(err.message).toContain("string error");
    });

    it("wraps third-party Error as EmailerError with cause", async () => {
      const thirdPartyError = new Error("Third-party library error");
      mockSendMail.mockRejectedValue(thirdPartyError);

      const client = new SendGridClient({ apiKey: "test-key" });
      const err = await client.send(minimalValidOptions).catch((e) => e);

      expect(err).toBeInstanceOf(EmailerError);
      expect(err.message).toContain("Third-party library error");
      expect(err.cause).toBe(thirdPartyError);
    });

    it("calls logger on SendGridError when provided", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers(),
        json: () =>
          Promise.resolve({
            errors: [{ message: "unauthorized", field: null }],
          }),
      });

      const mockLogger = createMockLogger();
      const client = new SendGridClient({
        apiKey: "test-key",
        logger: mockLogger,
      });

      await expect(client.send(minimalValidOptions)).rejects.toThrow(SendGridError);
      expect(mockLogger.calls.some((c) => c.level === "error" && c.message.includes("failed"))).toBe(true);
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
