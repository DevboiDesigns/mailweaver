import type { SendEmailOptions, EmailAddress } from "../../src/types";

export const minimalValidOptions: SendEmailOptions = {
  to: "recipient@example.com",
  from: "sender@example.com",
  subject: "Test",
  text: "Hello",
};

export const fullValidOptions: SendEmailOptions = {
  to: [{ email: "a@example.com", name: "A" }],
  from: { email: "sender@example.com", name: "Sender" },
  subject: "Full Test",
  text: "Plain text",
  html: "<p>HTML</p>",
  cc: [{ email: "cc@example.com" }],
  bcc: [{ email: "bcc@example.com", name: "BCC" }],
  templateId: "d-xxx",
  dynamicTemplateData: { key: "value" },
  categories: ["test"],
  sendAt: Math.floor(Date.now() / 1000) + 3600,
};

export const createRecipients = (count: number): EmailAddress[] =>
  Array.from({ length: count }, (_, i) => ({
    email: `user${i}@example.com`,
    name: `User ${i}`,
  }));
