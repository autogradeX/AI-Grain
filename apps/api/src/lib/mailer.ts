import nodemailer from "nodemailer";
import type { FastifyBaseLogger } from "fastify";

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

export class SmtpMailer implements Mailer {
  private readonly transport;

  constructor(
    smtpUrl: string,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport(smtpUrl);
  }

  async send(mail: Mail): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...mail });
  }
}

/** Used when no SMTP server is configured: writes each email to the log so links can be copied. */
export class LogMailer implements Mailer {
  constructor(private readonly log: FastifyBaseLogger) {}

  send(mail: Mail): Promise<void> {
    this.log.info({ mail }, `Email to ${mail.to}: ${mail.subject}`);
    return Promise.resolve();
  }
}

/** Keeps sent mail in memory. For tests. */
export class MemoryMailer implements Mailer {
  readonly sent: Mail[] = [];

  send(mail: Mail): Promise<void> {
    this.sent.push(mail);
    return Promise.resolve();
  }
}
