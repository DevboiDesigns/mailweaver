import {
  validateEmailFormat,
  validateFromEmailAscii,
  validateEmailAddresses,
  toEmailAddresses,
} from "../src/validation/schemas";
import {
  validateRecipientCount,
  validatePersonalizationCount,
  validateCustomArgsSize,
  validateCategories,
  validateSendAt,
  validateReplyToList,
  validateEmailSize,
  estimateEmailSize,
} from "../src/validation/limits";
import { ValidationError } from "../src/errors";
import { MAX_RECIPIENTS, MAX_CUSTOM_ARGS_BYTES } from "../src/constants";

describe("schemas", () => {
  describe("validateEmailFormat", () => {
    it("accepts valid email", () => {
      expect(() => validateEmailFormat("user@example.com")).not.toThrow();
    });

    it("throws for empty string", () => {
      expect(() => validateEmailFormat("")).toThrow(ValidationError);
      expect(() => validateEmailFormat("   ")).toThrow(ValidationError);
    });

    it("throws for invalid format", () => {
      expect(() => validateEmailFormat("invalid")).toThrow(ValidationError);
      expect(() => validateEmailFormat("missing@domain")).toThrow(ValidationError);
      expect(() => validateEmailFormat("@nodomain.com")).toThrow(ValidationError);
    });
  });

  describe("validateFromEmailAscii", () => {
    it("accepts ASCII-only from", () => {
      expect(() =>
        validateFromEmailAscii({ email: "test@example.com", name: "Test" })
      ).not.toThrow();
    });

    it("throws for Unicode in from name", () => {
      expect(() =>
        validateFromEmailAscii({ email: "test@example.com", name: "Tëst" })
      ).toThrow(ValidationError);
    });

    it("throws for Unicode in from email", () => {
      expect(() =>
        validateFromEmailAscii({ email: "tëst@example.com" })
      ).toThrow(ValidationError);
    });
  });

  describe("toEmailAddresses", () => {
    it("converts string to single EmailAddress", () => {
      expect(toEmailAddresses("a@b.com")).toEqual([{ email: "a@b.com" }]);
    });

    it("returns array as-is", () => {
      const arr = [{ email: "a@b.com", name: "A" }];
      expect(toEmailAddresses(arr)).toBe(arr);
    });

    it("wraps single object in array", () => {
      const obj = { email: "a@b.com", name: "A" };
      expect(toEmailAddresses(obj)).toEqual([obj]);
    });
  });

  describe("validateEmailAddresses", () => {
    it("accepts valid addresses", () => {
      expect(() =>
        validateEmailAddresses(
          [{ email: "a@b.com" }, { email: "b@b.com", name: "B" }],
          "to"
        )
      ).not.toThrow();
    });

    it("throws for invalid email in list", () => {
      expect(() =>
        validateEmailAddresses([{ email: "invalid" }], "to")
      ).toThrow(ValidationError);
    });

    it("throws for non-object in list", () => {
      expect(() =>
        validateEmailAddresses([{ email: "a@b.com" }, 123 as unknown as { email: string }], "to")
      ).toThrow(ValidationError);
    });
  });
});

describe("limits", () => {
  describe("validateRecipientCount", () => {
    it("accepts 1000 recipients", () => {
      const p = [
        {
          to: Array.from({ length: 1000 }, (_, i) => ({
            email: `u${i}@example.com`,
          })),
        },
      ];
      expect(() => validateRecipientCount(p)).not.toThrow();
    });

    it("throws for 1001 recipients", () => {
      const p = [
        {
          to: Array.from({ length: 1001 }, (_, i) => ({
            email: `u${i}@example.com`,
          })),
        },
      ];
      expect(() => validateRecipientCount(p)).toThrow(ValidationError);
      expect(() => validateRecipientCount(p)).toThrow(/1000/);
    });

    it("counts to + cc + bcc", () => {
      const p = [
        { to: [{ email: "a@x.com" }], cc: [{ email: "b@x.com" }] },
      ];
      expect(() => validateRecipientCount(p)).not.toThrow();
    });
  });

  describe("validatePersonalizationCount", () => {
    it("accepts 1000 personalizations", () => {
      const p = Array.from({ length: 1000 }, () => ({
        to: [{ email: "a@x.com" }],
      }));
      expect(() => validatePersonalizationCount(p)).not.toThrow();
    });

    it("throws for 1001 personalizations", () => {
      const p = Array.from({ length: 1001 }, () => ({
        to: [{ email: "a@x.com" }],
      }));
      expect(() => validatePersonalizationCount(p)).toThrow(ValidationError);
      expect(() => validatePersonalizationCount(p)).toThrow(/1000/);
    });
  });

  describe("validateCustomArgsSize", () => {
    it("accepts small custom args", () => {
      expect(() =>
        validateCustomArgsSize({ key: "value" })
      ).not.toThrow();
    });

    it("throws when custom args exceed 10000 bytes", () => {
      const bigValue = "x".repeat(MAX_CUSTOM_ARGS_BYTES);
      expect(() =>
        validateCustomArgsSize({ key: bigValue })
      ).toThrow(ValidationError);
      expect(() =>
        validateCustomArgsSize({ key: bigValue })
      ).toThrow(/10000/);
    });
  });

  describe("validateCategories", () => {
    it("accepts up to 10 categories", () => {
      const cats = Array.from({ length: 10 }, (_, i) => `cat${i}`);
      expect(() => validateCategories(cats)).not.toThrow();
    });

    it("throws for more than 10 categories", () => {
      const cats = Array.from({ length: 11 }, (_, i) => `cat${i}`);
      expect(() => validateCategories(cats)).toThrow(ValidationError);
      expect(() => validateCategories(cats)).toThrow(/10/);
    });

    it("throws for category exceeding 255 chars", () => {
      expect(() =>
        validateCategories(["x".repeat(256)])
      ).toThrow(ValidationError);
      expect(() =>
        validateCategories(["x".repeat(256)])
      ).toThrow(/255/);
    });

    it("throws for non-string category", () => {
      expect(() =>
        validateCategories(["valid", 123 as unknown as string])
      ).toThrow(ValidationError);
    });
  });

  describe("validateSendAt", () => {
    it("accepts send_at within 72 hours", () => {
      const valid = Math.floor(Date.now() / 1000) + 60 * 60; // 1 hour
      expect(() => validateSendAt(valid)).not.toThrow();
    });

    it("throws for send_at more than 72 hours ahead", () => {
      const invalid =
        Math.floor(Date.now() / 1000) + 73 * 60 * 60;
      expect(() => validateSendAt(invalid)).toThrow(ValidationError);
      expect(() => validateSendAt(invalid)).toThrow(/72/);
    });
  });

  describe("validateReplyToList", () => {
    it("accepts up to 1000 reply-to addresses", () => {
      const list = Array.from({ length: 1000 }, (_, i) => ({
        email: `r${i}@example.com`,
      }));
      expect(() => validateReplyToList(list)).not.toThrow();
    });

    it("throws for more than 1000", () => {
      const list = Array.from({ length: 1001 }, (_, i) => ({
        email: `r${i}@example.com`,
      }));
      expect(() => validateReplyToList(list)).toThrow(ValidationError);
    });
  });

  describe("validateEmailSize", () => {
    it("throws when size exceeds 30MB", () => {
      const overLimit = 30 * 1024 * 1024 + 1;
      expect(() => validateEmailSize(overLimit)).toThrow(ValidationError);
      expect(() => validateEmailSize(overLimit)).toThrow(/30MB/);
    });

    it("accepts size under 30MB", () => {
      expect(() => validateEmailSize(1024)).not.toThrow();
    });
  });

  describe("estimateEmailSize", () => {
    it("returns byte size of payload", () => {
      const payload = {
        personalizations: [{ to: [{ email: "a@b.com" }] }],
        from: { email: "x@y.com" },
        subject: "Test",
        content: [{ type: "text/plain", value: "Hello" }],
      };
      const size = estimateEmailSize(payload);
      expect(size).toBeGreaterThan(0);
      expect(size).toBe(Buffer.byteLength(JSON.stringify(payload), "utf8"));
    });
  });
});
