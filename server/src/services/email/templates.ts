import { env } from '../../config/env.js';
import { getSettings } from '../settings.service.js';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const escape = (value: string): string =>
  value.replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string,
  );

interface LayoutOptions {
  heading: string;
  intro: string;
  body?: string[];
  cta?: { label: string; href: string };
  facts?: [string, string][];
  footnote?: string;
}

/**
 * One inline-styled, table-free layout for every message. Email clients ignore
 * external stylesheets and most of flexbox, so everything is inline and the
 * layout stays single-column — which is also what reads best on a phone.
 */
function layout(options: LayoutOptions): { html: string; text: string } {
  const settings = getSettings();
  const accent = /^#[0-9a-fA-F]{6}$/.test(settings.accentColor) ? settings.accentColor : '#6d5efc';
  const brand = escape(settings.brandName);

  const facts = (options.facts ?? [])
    .filter(([, value]) => value)
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:40%">${escape(label)}</td>` +
        `<td style="padding:6px 0;color:#111827;font-size:13px;font-weight:500">${escape(value)}</td></tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(options.heading)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escape(options.intro)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb">
        <tr><td style="padding:22px 28px;border-bottom:1px solid #f0f0f3">
          <span style="display:inline-block;width:28px;height:28px;line-height:28px;text-align:center;border-radius:7px;background:${accent};color:#fff;font-weight:700;font-size:12px;vertical-align:middle">${escape(settings.logoText.slice(0, 2))}</span>
          <span style="margin-left:10px;font-weight:700;font-size:15px;color:#111827;vertical-align:middle">${brand}</span>
        </td></tr>
        <tr><td style="padding:28px">
          <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#111827">${escape(options.heading)}</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4b5563">${escape(options.intro)}</p>
          ${(options.body ?? [])
            .map(
              (paragraph) =>
                `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#4b5563">${escape(paragraph)}</p>`,
            )
            .join('')}
          ${facts ? `<table role="presentation" width="100%" style="margin:18px 0;border-top:1px solid #f0f0f3;border-bottom:1px solid #f0f0f3">${facts}</table>` : ''}
          ${
            options.cta
              ? `<p style="margin:24px 0 8px"><a href="${escape(options.cta.href)}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:15px;font-weight:600">${escape(options.cta.label)}</a></p>
                 <p style="margin:0;font-size:12px;color:#9ca3af;word-break:break-all">Or paste this into your browser: ${escape(options.cta.href)}</p>`
              : ''
          }
          ${options.footnote ? `<p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#9ca3af">${escape(options.footnote)}</p>` : ''}
        </td></tr>
        <tr><td style="padding:18px 28px;background:#fafafc;border-top:1px solid #f0f0f3;font-size:12px;color:#9ca3af">
          ${brand}${settings.contactEmail ? ` · <a href="mailto:${escape(settings.contactEmail)}" style="color:#9ca3af">${escape(settings.contactEmail)}</a>` : ''}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    options.heading,
    '',
    options.intro,
    ...(options.body ?? []),
    ...(options.facts ?? []).filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`),
    options.cta ? `\n${options.cta.label}: ${options.cta.href}` : '',
    options.footnote ?? '',
    '',
    `— ${settings.brandName}`,
  ]
    .filter(Boolean)
    .join('\n');

  return { html, text };
}

const url = (path: string): string => `${env.publicSiteUrl}${path}`;

export const templates = {
  welcome(name: string): RenderedEmail {
    const settings = getSettings();
    return {
      subject: `Welcome to ${settings.brandName}`,
      ...layout({
        heading: `Welcome, ${name.split(' ')[0]}`,
        intro:
          'Your client studio is ready. It is where you track every project, share files and message me directly — all private to you.',
        body: [
          'Send a brief whenever you are ready and I will come back with a quote before any work starts.',
        ],
        cta: { label: 'Open your dashboard', href: url('/dashboard') },
      }),
    };
  },

  passwordReset(token: string): RenderedEmail {
    return {
      subject: 'Reset your password',
      ...layout({
        heading: 'Reset your password',
        intro: 'Use the button below to choose a new password. The link expires in one hour.',
        cta: { label: 'Choose a new password', href: url(`/reset-password?token=${token}`) },
        footnote:
          'If you did not ask for this, you can ignore this email — your password will not change. Resetting also signs you out everywhere else.',
      }),
    };
  },

  newRequest(input: {
    name: string;
    email: string;
    projectType?: string | null;
    budget?: string | null;
    deadline?: string | null;
    description: string;
    requestId: string;
  }): RenderedEmail {
    return {
      subject: `New project request from ${input.name}`,
      ...layout({
        heading: 'New project request',
        intro: `${input.name} sent a brief through the website.`,
        body: [input.description.slice(0, 600)],
        facts: [
          ['From', input.name],
          ['Email', input.email],
          ['Project type', input.projectType ?? '—'],
          ['Budget', input.budget ?? 'Not given'],
          ['Deadline', input.deadline ?? 'Not given'],
        ],
        cta: { label: 'Open the request', href: url(`/admin/requests/${input.requestId}`) },
      }),
    };
  },

  newMessage(input: { fromName: string; preview: string; toAdmin: boolean }): RenderedEmail {
    return {
      subject: input.toAdmin ? `New message from ${input.fromName}` : 'New message from the studio',
      ...layout({
        heading: input.toAdmin ? `${input.fromName} sent a message` : 'You have a new message',
        intro: input.preview || 'An attachment was sent.',
        cta: {
          label: 'Read and reply',
          href: url(input.toAdmin ? '/admin/messages' : '/dashboard/messages'),
        },
        footnote: 'You can turn message emails off in your notification settings.',
      }),
    };
  },

  projectStatus(input: { title: string; status: string; note?: string | null; projectId: string }): RenderedEmail {
    const label = input.status.replace(/_/g, ' ');
    return {
      subject: `${input.title} — ${label}`,
      ...layout({
        heading: `Your project is now: ${label}`,
        intro: input.note || `“${input.title}” moved to the ${label} stage.`,
        cta: { label: 'View the project', href: url(`/dashboard/projects/${input.projectId}`) },
      }),
    };
  },

  deliveryReady(input: { title: string; version: number; projectId: string; note?: string | null }): RenderedEmail {
    return {
      subject: `A design is ready for review: ${input.title}`,
      ...layout({
        heading: 'A design is ready for your review',
        intro: input.note || `Version ${input.version} of “${input.title}” is waiting for you.`,
        body: ['Open the project to approve it, or send it back with the changes you want.'],
        cta: { label: 'Review the design', href: url(`/dashboard/projects/${input.projectId}`) },
      }),
    };
  },

  revisionRequested(input: { clientName: string; message: string; projectId: string }): RenderedEmail {
    return {
      subject: `${input.clientName} requested a revision`,
      ...layout({
        heading: 'Revision requested',
        intro: input.message.slice(0, 500),
        cta: { label: 'Open the project', href: url(`/admin/projects/${input.projectId}`) },
      }),
    };
  },

  invoice(input: {
    number: string;
    title: string;
    amount: string;
    dueDate?: string | null;
    method: string;
    invoiceId: string;
    bank?: { label: string; value: string }[];
  }): RenderedEmail {
    const settings = getSettings();
    return {
      subject: `Invoice ${input.number} — ${input.amount}`,
      ...layout({
        heading: `Invoice ${input.number}`,
        intro: `${input.title} — ${input.amount}.`,
        facts: [
          ['Amount', input.amount],
          ['Due', input.dueDate ?? 'On receipt'],
          ['Payment method', input.method],
          ...((input.bank ?? []).map((entry) => [entry.label, entry.value]) as [string, string][]),
        ],
        cta: { label: 'View and pay', href: url(`/dashboard/invoices/${input.invoiceId}`) },
        footnote: settings.payments.invoiceFooter,
      }),
    };
  },

  paymentReceived(input: { number: string; amount: string; clientName: string; toAdmin: boolean }): RenderedEmail {
    return {
      subject: input.toAdmin
        ? `Payment received — ${input.number} (${input.amount})`
        : `Payment received — thank you`,
      ...layout({
        heading: input.toAdmin ? 'Payment received' : 'Thank you — payment received',
        intro: input.toAdmin
          ? `${input.clientName} paid ${input.amount} against invoice ${input.number}.`
          : `We have received ${input.amount} for invoice ${input.number}.`,
        cta: {
          label: input.toAdmin ? 'Open invoices' : 'View your invoices',
          href: url(input.toAdmin ? '/admin/invoices' : '/dashboard/invoices'),
        },
      }),
    };
  },

  test(): RenderedEmail {
    const settings = getSettings();
    return {
      subject: `Test email from ${settings.brandName}`,
      ...layout({
        heading: 'Your email connector works',
        intro:
          'This is a test message sent from Admin → Connectors. If you are reading it, transactional email is configured correctly.',
        facts: [
          ['From', `${settings.email.fromName} <${settings.email.fromEmail}>`],
          ['Site URL', env.publicSiteUrl],
        ],
      }),
    };
  },
};
