import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { APP_CONFIG, type AppConfig } from '../../../config/env.js';
import type { EmailMessage } from './messages.js';

export abstract class EmailSender {
  abstract send(to: string, message: EmailMessage): Promise<void>;
}

@Injectable()
export class SmtpEmailSender extends EmailSender implements OnModuleDestroy {
  private transport: Transporter | null = null;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    super();
  }

  private getTransport(): Transporter {
    this.transport ??= createTransport({
      host: this.config.SMTP_HOST,
      port: this.config.SMTP_PORT,
      secure: this.config.SMTP_SECURE,
      auth: this.config.SMTP_USER
        ? { user: this.config.SMTP_USER, pass: this.config.SMTP_PASSWORD ?? '' }
        : undefined,
      pool: true,
      maxConnections: 2,
      connectionTimeout: 10_000,
      socketTimeout: 20_000,
    });
    return this.transport;
  }

  async send(to: string, message: EmailMessage): Promise<void> {
    await this.getTransport().sendMail({ from: this.config.SMTP_FROM, to, ...message });
  }

  onModuleDestroy(): void {
    this.transport?.close();
  }
}
