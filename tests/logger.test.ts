import {
  noopLogger,
  createConsoleLogger,
  redactEmail,
  createRequestId,
  type Logger,
} from "../src/logger";

describe("logger", () => {
  describe("noopLogger", () => {
    it("does not throw when called", () => {
      expect(() => {
        noopLogger.debug("test");
        noopLogger.info("test");
        noopLogger.warn("test");
        noopLogger.error("test");
      }).not.toThrow();
    });

    it("accepts context without throwing", () => {
      expect(() => {
        noopLogger.info("msg", { key: "value", count: 1 });
      }).not.toThrow();
    });
  });

  describe("createConsoleLogger", () => {
    const originalConsole = { ...console };

    beforeEach(() => {
      jest.spyOn(console, "debug").mockImplementation(() => {});
      jest.spyOn(console, "info").mockImplementation(() => {});
      jest.spyOn(console, "warn").mockImplementation(() => {});
      jest.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("logs info by default", () => {
      const logger = createConsoleLogger();
      logger.info("test message", { foo: "bar" });

      expect(console.info).toHaveBeenCalledTimes(1);
      const call = (console.info as jest.Mock).mock.calls[0][0];
      const parsed = JSON.parse(call);
      expect(parsed.level).toBe("info");
      expect(parsed.message).toContain("test message");
      expect(parsed.foo).toBe("bar");
      expect(parsed.timestamp).toBeDefined();
    });

    it("respects minLevel and filters debug when minLevel is info", () => {
      const logger = createConsoleLogger({ minLevel: "info" });
      logger.debug("debug msg");
      logger.info("info msg");

      expect(console.debug).not.toHaveBeenCalled();
      expect(console.info).toHaveBeenCalledTimes(1);
    });

    it("logs debug when minLevel is debug", () => {
      const logger = createConsoleLogger({ minLevel: "debug" });
      logger.debug("debug msg");

      expect(console.debug).toHaveBeenCalledTimes(1);
      const call = (console.debug as jest.Mock).mock.calls[0][0];
      expect(JSON.parse(call).level).toBe("debug");
    });

    it("uses prefix when provided", () => {
      const logger = createConsoleLogger({ prefix: "[emailer]" });
      logger.info("hello");

      const parsed = JSON.parse((console.info as jest.Mock).mock.calls[0][0]);
      expect(parsed.message).toBe("[emailer] hello");
    });

    it("logs warn and error", () => {
      const logger = createConsoleLogger({ minLevel: "debug" });
      logger.warn("warn msg", { code: "WARN" });
      logger.error("error msg", { code: "ERR" });

      expect(console.warn).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledTimes(1);
      expect(JSON.parse((console.warn as jest.Mock).mock.calls[0][0]).level).toBe("warn");
      expect(JSON.parse((console.error as jest.Mock).mock.calls[0][0]).level).toBe("error");
    });

    it("child logger merges context", () => {
      const logger = createConsoleLogger({ minLevel: "info" });
      const child = logger.child!({ requestId: "req-123" });
      child.info("child msg", { extra: "data" });

      const parsed = JSON.parse((console.info as jest.Mock).mock.calls[0][0]);
      expect(parsed.requestId).toBe("req-123");
      expect(parsed.extra).toBe("data");
      expect(parsed.message).toContain("child msg");
    });
  });

  describe("redactEmail", () => {
    it("redacts local part and preserves domain", () => {
      expect(redactEmail("user@example.com")).toBe("***@example.com");
    });

    it("returns [redacted] for email without @", () => {
      expect(redactEmail("invalid")).toBe("[redacted]");
    });

    it("handles subdomains", () => {
      expect(redactEmail("test@mail.example.com")).toBe("***@mail.example.com");
    });
  });

  describe("createRequestId", () => {
    it("returns string starting with req_", () => {
      const id = createRequestId();
      expect(id).toMatch(/^req_/);
    });

    it("returns unique ids", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(createRequestId());
      }
      expect(ids.size).toBe(100);
    });
  });
});
