import { SendGridClient } from "../src/client";
import { ValidationError, SendGridError } from "../src/errors";
import { minimalValidOptions } from "./fixtures";

const mockFetch = jest.fn();

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
});

describe("SendGridClient", () => {
  describe("constructor", () => {
    it("throws when apiKey is missing", () => {
      expect(() => new SendGridClient({ apiKey: "" })).toThrow();
      expect(() => new SendGridClient({ apiKey: "" as unknown as string })).toThrow();
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
