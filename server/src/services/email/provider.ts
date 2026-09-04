import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env.js';
import { getSettings } from '../settings.service.js';

export type EmailProviderName = 'resend' | 'smtp' | 'none';

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export interface SendResult {
  provider: EmailProviderName;
  status: 'sent' | 'skipped' | 'failed';
  error?: string;
}

/**
 * Picks the transport to use. `auto` prefers Resend (managed deliverability,
 * nothing to run) and falls back to SMTP when only that is configured.
 */
export function activeProvider(): EmailProviderName {
  const preference = getSettings().email.provider;
  const hasResend = !!env.resendApiKey;
  const hasSmtp = !!env.smtp.host && !!env.smtp.user;

  if (preference === 'resend') return hasResend ? 'resend' : 'none';
  if (preference === 'smtp') return hasSmtp ? 'smtp' : 'none';
  if (hasResend) return 'resend';
  if (hasSmtp) return 'smtp';
  return 'none';
}

let transporter: Transporter | null = null;

function smtpTransport(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: { user: env.smtp.user, pass: env.smtp.pass },
  });
  return transporter;
}

function fromHeader(): string {
  const { fromName, fromEmail } = getSettings().email;
  return fromName ? `${fromName} <${fromEmail}>` : fromEmail;
}

async function sendViaResend(email: OutboundEmail): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.resendApiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: fromHeader(),
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      reply_to: email.replyTo || undefined,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Resend returned ${response.status}: ${detail.slice(0, 300)}`);
  }
}

async function sendViaSmtp(email: OutboundEmail): Promise<void> {
  await smtpTransport().sendMail({
    from: fromHeader(),
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    replyTo: email.replyTo || undefined,
  });
}

/**
 * Delivers one message. Never throws: a mail outage must not fail the request
 * that triggered it, so failures are returned for the caller to log.
 */
export async function deliver(email: OutboundEmail): Promise<SendResult> {
  const provider = activeProvider();
  if (provider === 'none') {
    return { provider, status: 'skipped', error: 'No mail transport configured.' };
  }

  try {
    if (provider === 'resend') await sendViaResend(email);
    else await sendViaSmtp(email);
    return { provider, status: 'sent' };
  } catch (error) {
    return {
      provider,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown mail error',
    };
  }
}

/** Confirms the transport actually works, used by the "send test email" button. */
export async function verifyTransport(): Promise<{ ok: boolean; message: string }> {
  const provider = activeProvider();
  if (provider === 'none') return { ok: false, message: 'No mail transport is configured.' };
  if (provider === 'resend') return { ok: true, message: 'Resend API key is present.' };

  try {
    await smtpTransport().verify();
    return { ok: true, message: `Connected to ${env.smtp.host}:${env.smtp.port}.` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'SMTP connection failed.',
    };
  }
}
