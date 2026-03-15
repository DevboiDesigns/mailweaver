import type {
  SendEmailOptions,
  SendResponse,
  EmailAddress,
  Personalization,
} from "./types";
import { sendMail } from "./transport";
import type { MailSendBody } from "./transport";
import { toEmailAddresses } from "./validation";
import {
  ConfigurationError,
  EmailerError,
  ErrorCode,
  SendGridError,
} from "./errors";
import type { Logger, LogContext } from "./logger";
import { noopLogger, redactEmail } from "./logger";
import {
  validateEmailFormat,
  validateFromEmailAscii,
  validateEmailAddresses,
} from "./validation/schemas";
import {
  validateRecipientCount,
  validatePersonalizationCount,
  validateCustomArgsSize,
  validateCategories,
  validateSendAt,
  validateReplyToList,
  validateEmailSize,
  estimateEmailSize,
} from "./validation/limits";
import { MAX_EMAIL_SIZE_BYTES } from "./constants";

function normalizeFrom(from: string | EmailAddress): EmailAddress {
  if (typeof from === "string") {
    return { email: from };
  }
  return from;
}

function buildPersonalizations(options: SendEmailOptions): Personalization[] {
  if (options.personalizations && options.personalizations.length > 0) {
    return options.personalizations;
  }

  const to = toEmailAddresses(options.to);
  const personalization: Personalization = { to };

  if (options.cc) {
    personalization.cc = toEmailAddresses(options.cc);
  }
  if (options.bcc) {
    personalization.bcc = toEmailAddresses(options.bcc);
  }
  if (options.subject) {
    personalization.subject = options.subject;
  }
  if (options.dynamicTemplateData) {
    personalization.dynamic_template_data = options.dynamicTemplateData;
  }
  if (options.customArgs) {
    personalization.custom_args = options.customArgs;
  }
  if (options.sendAt !== undefined) {
    personalization.send_at = options.sendAt;
  }

  return [personalization];
}

function buildMailSendBody(options: SendEmailOptions): MailSendBody {
  const personalizations = buildPersonalizations(options);
  const from = normalizeFrom(options.from);

  const body: MailSendBody = {
    personalizations: personalizations.map((p) => ({
      to: p.to,
      cc: p.cc,
      bcc: p.bcc,
      subject: p.subject,
      dynamic_template_data: p.dynamic_template_data,
      custom_args: p.custom_args,
      send_at: p.send_at,
    })),
    from: { email: from.email, name: from.name },
  };

  if (options.replyTo) {
    const rt = toEmailAddresses(options.replyTo)[0];
    body.reply_to = { email: rt.email, name: rt.name };
  }
  if (options.replyToList && options.replyToList.length > 0) {
    body.reply_to_list = options.replyToList;
  }
  if (options.subject && personalizations.every((p) => !p.subject)) {
    body.subject = options.subject;
  }
  if (options.text || options.html) {
    body.content = [];
    if (options.text) {
      body.content.push({ type: "text/plain", value: options.text });
    }
    if (options.html) {
      body.content.push({ type: "text/html", value: options.html });
    }
  }
  if (options.attachments && options.attachments.length > 0) {
    body.attachments = options.attachments.map((a) => ({
      content: a.content,
      filename: a.filename,
      type: a.type,
      disposition: a.disposition ?? "attachment",
      content_id: a.content_id,
    }));
  }
  if (options.templateId) {
    body.template_id = options.templateId;
  }
  if (options.categories && options.categories.length > 0) {
    body.categories = options.categories;
  }
  if (options.customArgs && Object.keys(options.customArgs).length > 0) {
    body.custom_args = options.customArgs;
  }
  if (options.sendAt !== undefined) {
    body.send_at = options.sendAt;
  }
  if (options.asmGroupId !== undefined) {
    body.asm = {
      group_id: options.asmGroupId,
      groups_to_display: options.asmGroupsToDisplay,
    };
  }
  if (options.ipPoolName) {
    body.ip_pool_name = options.ipPoolName;
  }
  if (options.sandboxMode) {
    body.mail_settings = { sandbox_mode: { enable: true } };
  }

  return body;
}

/**
 * SendGrid v3 API client with validation and type safety.
 */
export class SendGridClient {
  private readonly apiKey: string;
  private readonly baseUrl?: string;
  private readonly timeoutMs?: number;
  private readonly logger: Logger;

  constructor(config: {
    apiKey: string;
    baseUrl?: string;
    timeoutMs?: number;
    logger?: Logger;
  }) {
    if (!config.apiKey || typeof config.apiKey !== "string") {
      throw new ConfigurationError(
        "SendGridClient requires a valid apiKey",
        "apiKey"
      );
    }
    const trimmed = config.apiKey.trim();
    if (!trimmed) {
      throw new ConfigurationError(
        "apiKey cannot be empty or whitespace",
        "apiKey"
      );
    }
    if (config.timeoutMs !== undefined) {
      if (typeof config.timeoutMs !== "number" || config.timeoutMs <= 0) {
        throw new ConfigurationError(
          "timeoutMs must be a positive number",
          "timeoutMs"
        );
      }
    }
    this.apiKey = trimmed;
    this.baseUrl = config.baseUrl;
    this.timeoutMs = config.timeoutMs;
    this.logger = config.logger ?? noopLogger;
  }

  /**
   * Send an email via SendGrid v3 Mail Send API.
   */
  async send(options: SendEmailOptions): Promise<SendResponse> {
    const from = normalizeFrom(options.from);
    const personalizations = buildPersonalizations(options);

    const recipientCount = personalizations.reduce(
      (sum, p) =>
        sum +
        (p.to?.length ?? 0) +
        (p.cc?.length ?? 0) +
        (p.bcc?.length ?? 0),
      0
    );

    this.logger.debug("Send email validation starting", {
      fromDomain: redactEmail(from.email),
      recipientCount,
      personalizationCount: personalizations.length,
      hasTemplate: !!options.templateId,
    });

    let body: MailSendBody;
    try {
      validateEmailFormat(from.email);
      validateFromEmailAscii(from);

      for (const p of personalizations) {
        validateEmailAddresses(p.to, "to");
        if (p.cc) validateEmailAddresses(p.cc, "cc");
        if (p.bcc) validateEmailAddresses(p.bcc, "bcc");
      }

      validateRecipientCount(personalizations);
      validatePersonalizationCount(personalizations);
      validateCustomArgsSize(options.customArgs);
      validateCategories(options.categories);
      validateSendAt(options.sendAt);
      validateReplyToList(options.replyToList);

      body = buildMailSendBody(options);
      const estimatedSize = estimateEmailSize(body);
      if (estimatedSize >= MAX_EMAIL_SIZE_BYTES) {
        validateEmailSize(estimatedSize);
      }
    } catch (err) {
      if (EmailerError.isEmailerError(err)) {
        this.logger.warn("Send email validation failed", {
          error: err.message,
          code: err.code,
          field: "field" in err ? (err as { field?: string }).field : undefined,
        });
      }
      throw err;
    }

    try {
      const result = await sendMail(body, {
        apiKey: this.apiKey,
        baseUrl: this.baseUrl,
        timeoutMs: this.timeoutMs,
        logger: this.logger,
      });

      this.logger.info("Send email succeeded", {
        statusCode: result.statusCode,
        rateLimitRemaining: result.rateLimit?.remaining,
      });

      return {
        statusCode: result.statusCode,
        headers: result.headers,
        rateLimit: result.rateLimit,
      };
    } catch (err) {
      if (EmailerError.isEmailerError(err)) {
        const logContext: LogContext = {
          error: err.message,
          code: err.code,
        };
        if (err instanceof SendGridError) {
          logContext.statusCode = err.statusCode;
          logContext.isRetryable = err.isRetryable();
        }
        this.logger.error("Send email failed", logContext);
      } else {
        this.logger.error("Send email failed with unexpected error", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      // Re-throw known emailer errors as-is
      if (EmailerError.isEmailerError(err)) {
        throw err;
      }
      // Wrap unexpected errors with context
      throw new EmailerError(
        `Unexpected error while sending email: ${err instanceof Error ? err.message : String(err)}`,
        ErrorCode.UNKNOWN,
        { cause: err instanceof Error ? err : undefined }
      );
    }
  }
}
