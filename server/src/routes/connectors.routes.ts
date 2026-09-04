import { Router } from 'express';
import { z } from 'zod';
import { env, emailConfigured, paystackConfigured, stripeConfigured } from '../config/env.js';
import { badRequest } from '../lib/errors.js';
import { rateLimit } from '../lib/rateLimit.js';
import { validateBody } from '../lib/validate.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAdmin } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';
import { getSettings } from '../services/settings.service.js';
import { activeProvider, recentEmails, sendEmail, templates, verifyTransport } from '../services/email/index.js';
import { availableMethods, paystack, stripe } from '../services/payments/index.js';
import { aiConfigured } from '../services/ai/provider.js';

export const connectorsRouter = Router();
connectorsRouter.use(requireAdmin);

export interface ConnectorStatus {
  key: string;
  name: string;
  category: 'email' | 'payments' | 'ai';
  /** Credentials present on the server. */
  configured: boolean;
  /** Switched on by the designer in settings. */
  enabled: boolean;
  recommended: boolean;
  testMode: boolean;
  summary: string;
  /** Environment variables this connector reads. Names only — never values. */
  envVars: string[];
  setupUrl: string;
  /** Non-blocking notes shown in the admin, e.g. regional availability. */
  notes: string[];
}

/**
 * Reports what is wired up. Deliberately returns only booleans and variable
 * *names* — no key, or any prefix of one, ever leaves the server.
 */
connectorsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const settings = getSettings();
    const methods = availableMethods();
    const method = (key: string) => methods.find((entry) => entry.method === key);

    const connectors: ConnectorStatus[] = [
      {
        key: 'resend',
        name: 'Resend',
        category: 'email',
        configured: !!env.resendApiKey,
        enabled: settings.email.enabled && ['auto', 'resend'].includes(settings.email.provider),
        recommended: true,
        testMode: false,
        summary:
          'Transactional email: password resets, invoices, new requests, message alerts. Recommended — one API key, no server to run, and domain authentication that keeps mail out of spam.',
        envVars: ['RESEND_API_KEY'],
        setupUrl: 'https://resend.com/api-keys',
        notes: [
          'Verify your sending domain before going live, or mail will land in spam.',
          'The free tier covers 3,000 emails a month — far more than a studio sends.',
        ],
      },
      {
        key: 'smtp',
        name: 'SMTP',
        category: 'email',
        configured: !!env.smtp.host && !!env.smtp.user,
        enabled: settings.email.enabled && ['auto', 'smtp'].includes(settings.email.provider),
        recommended: false,
        testMode: false,
        summary:
          'Any standard mail server — your host’s mailbox, Postmark, Amazon SES or Mailgun. Use this if you already pay for email and would rather not add another account.',
        envVars: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_SECURE'],
        setupUrl: 'https://nodemailer.com/smtp/',
        notes: ['Used automatically only when no Resend key is present.'],
      },
      {
        key: 'stripe',
        name: 'Stripe',
        category: 'payments',
        configured: stripeConfigured(),
        enabled: settings.payments.stripeEnabled,
        recommended: true,
        testMode: method('stripe')?.testMode ?? false,
        summary:
          'Card payments on a Stripe-hosted checkout page, so card details never touch this site. Recommended wherever Stripe can pay out to your bank.',
        envVars: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
        setupUrl: 'https://dashboard.stripe.com/apikeys',
        notes: [
          'Add a webhook for POST /api/payments/webhook/stripe listening to checkout.session.completed, then paste its signing secret.',
          'Stripe cannot currently pay out to accounts in Nigeria, Ghana or Kenya — use Paystack there.',
        ],
      },
      {
        key: 'paystack',
        name: 'Paystack',
        category: 'payments',
        configured: paystackConfigured(),
        enabled: settings.payments.paystackEnabled,
        recommended: false,
        testMode: method('paystack')?.testMode ?? false,
        summary:
          'Cards, bank transfer and USSD for Nigeria, Ghana, South Africa, Kenya and Egypt. Recommended over Stripe if your bank account is in one of those countries.',
        envVars: ['PAYSTACK_SECRET_KEY'],
        setupUrl: 'https://dashboard.paystack.com/#/settings/developer',
        notes: ['Add a webhook for POST /api/payments/webhook/paystack — Paystack signs it with your secret key.'],
      },
      {
        key: 'bank_transfer',
        name: 'Direct bank transfer',
        category: 'payments',
        configured: method('bank_transfer')?.configured ?? false,
        enabled: settings.payments.bankTransferEnabled,
        recommended: false,
        testMode: false,
        summary:
          'No provider, no fees, no key: your account details appear on the invoice and you confirm receipt yourself. Works everywhere and is the fallback when a card provider is unavailable.',
        envVars: [],
        setupUrl: '',
        notes: [
          'Enter the account details in Settings → Payments — they are shown only to the client the invoice is addressed to.',
          'Payment is not automatic: mark the invoice paid once the money lands.',
        ],
      },
      {
        key: 'anthropic',
        name: 'Anthropic (Designer’s AI)',
        category: 'ai',
        configured: aiConfigured(),
        enabled: settings.aiSettings.enabled,
        recommended: true,
        testMode: false,
        summary:
          'Powers the admin assistant and the feature builder. Without a key the assistant still runs on local heuristics built from your studio data.',
        envVars: ['ANTHROPIC_API_KEY', 'AI_MODEL'],
        setupUrl: 'https://console.anthropic.com/settings/keys',
        notes: ['The key is read on the server only and is never sent to the browser.'],
      },
    ];

    res.json({
      connectors,
      email: {
        activeProvider: activeProvider(),
        configured: emailConfigured(),
        from: `${settings.email.fromName} <${settings.email.fromEmail}>`,
      },
      payments: { methods, currency: settings.payments.currency },
      webhookUrls: {
        stripe: `${env.publicSiteUrl}/api/payments/webhook/stripe`,
        paystack: `${env.publicSiteUrl}/api/payments/webhook/paystack`,
      },
    });
  }),
);

/** Verifies the transport, then sends a real message so delivery is proven. */
connectorsRouter.post(
  '/email/test',
  rateLimit({ scope: 'email-test', windowMs: 60_000, max: 5 }),
  validateBody(z.object({ to: z.string().trim().toLowerCase().email().optional() })),
  asyncHandler(async (req, res) => {
    const to = (req.body as { to?: string }).to ?? req.auth!.email;

    const transport = await verifyTransport();
    if (!transport.ok) throw badRequest(transport.message);

    const result = await sendEmail({ to, template: 'test', email: templates.test() });
    if (result.status === 'failed') throw badRequest(result.error ?? 'The test email could not be sent.');

    logActivity({
      actorId: req.auth!.id,
      actorType: 'admin',
      action: 'connector.email_tested',
      entityType: 'settings',
      meta: { to, provider: result.provider, status: result.status },
    });

    res.json({ ok: true, provider: result.provider, status: result.status, to });
  }),
);

connectorsRouter.get(
  '/email/log',
  asyncHandler(async (_req, res) => {
    res.json({ emails: recentEmails(60) });
  }),
);

/** Confirms a payment provider's credentials by calling it, not by guessing. */
connectorsRouter.post(
  '/payments/test',
  rateLimit({ scope: 'payments-test', windowMs: 60_000, max: 8 }),
  validateBody(z.object({ provider: z.enum(['stripe', 'paystack']) })),
  asyncHandler(async (req, res) => {
    const { provider } = req.body as { provider: 'stripe' | 'paystack' };

    try {
      if (provider === 'stripe') {
        if (!stripeConfigured()) throw new Error('STRIPE_SECRET_KEY is not set on the server.');
        // A zero-amount balance read is the cheapest proof the key is live.
        await stripe.createCheckout({
          invoiceId: 'connection-test',
          invoiceNumber: 'TEST',
          title: 'Connection test',
          description: 'Created by the connector check and never paid.',
          amountMinor: 100,
          currency: getSettings().payments.currency,
          customerEmail: req.auth!.email,
        });
      } else {
        if (!paystackConfigured()) throw new Error('PAYSTACK_SECRET_KEY is not set on the server.');
        await paystack.createCheckout({
          invoiceId: 'connection-test',
          invoiceNumber: 'TEST',
          title: 'Connection test',
          amountMinor: 10_000,
          currency: getSettings().payments.currency,
          customerEmail: req.auth!.email,
        });
      }
      res.json({ ok: true, message: `${provider} accepted the credentials.` });
    } catch (error) {
      throw badRequest(error instanceof Error ? error.message : `${provider} rejected the request.`);
    }
  }),
);
