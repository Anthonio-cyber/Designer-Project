import { db } from '../../db/index.js';
import { uuid } from '../../lib/ids.js';
import { getSettings } from '../settings.service.js';
import { activeProvider, deliver, verifyTransport, type SendResult } from './provider.js';
import { templates, type RenderedEmail } from './templates.js';

export { templates, verifyTransport, activeProvider };
export type { RenderedEmail };

export type NotifyKey = keyof ReturnType<typeof getSettings>['email']['notify'];

const logStmt = db.prepare(
  `INSERT INTO email_log (id, to_email, subject, template, provider, status, error)
   VALUES (@id, @to, @subject, @template, @provider, @status, @error)`,
);

interface SendOptions {
  to: string;
  template: string;
  email: RenderedEmail;
  /** Which notification switch governs this message. Omit for always-send mail. */
  notifyKey?: NotifyKey;
  replyTo?: string;
}

/**
 * Sends one transactional email and records the attempt.
 *
 * Deliberately fire-and-forget from the caller's perspective: a mail outage must
 * never fail the request that triggered it, so every outcome — sent, skipped or
 * failed — resolves rather than throws, and lands in `email_log`.
 */
export async function sendEmail(options: SendOptions): Promise<SendResult> {
  const settings = getSettings();

  const disabled =
    !settings.email.enabled ||
    (options.notifyKey !== undefined && !settings.email.notify[options.notifyKey]);

  const result: SendResult = disabled
    ? { provider: activeProvider(), status: 'skipped', error: 'Disabled in settings.' }
    : await deliver({
        to: options.to,
        subject: options.email.subject,
        html: options.email.html,
        text: options.email.text,
        replyTo: options.replyTo ?? settings.email.replyTo,
      });

  logStmt.run({
    id: uuid(),
    to: options.to,
    subject: options.email.subject,
    template: options.template,
    provider: result.provider,
    status: result.status,
    error: result.error ?? null,
  });

  if (result.status === 'failed') {
    console.error(`[email] ${options.template} to ${options.to} failed: ${result.error}`);
  }
  return result;
}

/** Queues a send without making the caller await it. */
export function sendEmailAsync(options: SendOptions): void {
  void sendEmail(options).catch((error) => console.error('[email] unexpected failure', error));
}

/** Every active administrator's address, for studio-facing notifications. */
export function adminRecipients(): { id: string; name: string; email: string }[] {
  return db
    .prepare(`SELECT id, name, email FROM users WHERE role = 'admin' AND status = 'active'`)
    .all() as { id: string; name: string; email: string }[];
}

export function recentEmails(limit = 50) {
  return db
    .prepare(
      `SELECT id, to_email AS toEmail, subject, template, provider, status, error, created_at AS createdAt
         FROM email_log ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit);
}
