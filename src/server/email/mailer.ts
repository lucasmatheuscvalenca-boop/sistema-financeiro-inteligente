import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTransport } from "nodemailer";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  readonly id: string;
  send(message: EmailMessage): Promise<void>;
}

/**
 * Envio por SMTP. Com Gmail basta SMTP_USER (o endereço) e SMTP_PASSWORD (uma senha de app);
 * outro provedor (Resend, Brevo, Zoho) usa também SMTP_HOST e SMTP_PORT.
 */
class SmtpMailer implements Mailer {
  readonly id = "smtp";
  private transport: ReturnType<typeof createTransport> | null = null;

  constructor(
    private readonly user: string,
    private readonly password: string,
  ) {}

  private getTransport() {
    const port = Number(process.env.SMTP_PORT) || 465;
    this.transport ??= createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: { user: this.user, pass: this.password },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    return this.transport;
  }

  async send(message: EmailMessage): Promise<void> {
    await this.getTransport().sendMail({
      from: process.env.EMAIL_FROM || `"Meu Banqueiro" <${this.user}>`,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}

/** Testes de ponta a ponta: grava cada e-mail como JSON numa pasta, em vez de enviar. */
class OutboxMailer implements Mailer {
  readonly id = "outbox";
  constructor(private readonly dir: string) {}
  async send(message: EmailMessage): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, `${Date.now()}-${message.to.replace(/[^a-z0-9@._-]/gi, "_")}.json`), JSON.stringify(message));
  }
}

let override: Mailer | null | undefined;

/** Permite injetar um carteiro (testes) ou desligar o envio (null). */
export function setMailer(m: Mailer | null | undefined): void {
  override = m;
}

export function getMailer(): Mailer | null {
  if (override !== undefined) return override;
  // A pasta de saída nunca vale na Vercel, para não engolir e-mails reais.
  if (process.env.EMAIL_OUTBOX_DIR && !process.env.VERCEL) return new OutboxMailer(process.env.EMAIL_OUTBOX_DIR);
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD?.replace(/\s+/g, "");
  return user && password ? new SmtpMailer(user, password) : null;
}

export function emailConfigured(): boolean {
  return getMailer() !== null;
}
