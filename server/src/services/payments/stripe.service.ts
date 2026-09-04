import Stripe from 'stripe';
import { env, stripeConfigured } from '../../config/env.js';
import { getSettings } from '../settings.service.js';

let client: Stripe | null = null;

function stripe(): Stripe {
  if (!stripeConfigured()) throw new Error('Stripe is not configured on this server.');
  client ??= new Stripe(env.stripeSecretKey, { apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion });
  return client;
}

/** True while running against a test-mode key, surfaced in the admin UI. */
export const isTestMode = (): boolean => env.stripeSecretKey.startsWith('sk_test_');

export interface CheckoutInput {
  invoiceId: string;
  invoiceNumber: string;
  title: string;
  description?: string | null;
  amountMinor: number;
  currency: string;
  customerEmail: string;
}

export interface CheckoutSession {
  url: string;
  reference: string;
  expiresAt: string | null;
}

/**
 * Creates a hosted Stripe Checkout session. Card details are entered on Stripe's
 * page, never on this site, so the platform stays out of PCI scope entirely.
 */
export async function createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
  const settings = getSettings();

  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    customer_email: input.customerEmail,
    client_reference_id: input.invoiceId,
    // Echoed back on the webhook so a payment can be matched to its invoice
    // without trusting anything in the redirect URL.
    metadata: { invoiceId: input.invoiceId, invoiceNumber: input.invoiceNumber },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: input.currency.toLowerCase(),
          unit_amount: input.amountMinor,
          product_data: {
            name: `${input.invoiceNumber} — ${input.title}`.slice(0, 250),
            description: input.description?.slice(0, 400) || undefined,
          },
        },
      },
    ],
    success_url: `${env.publicSiteUrl}/dashboard/invoices/${input.invoiceId}?paid=1`,
    cancel_url: `${env.publicSiteUrl}/dashboard/invoices/${input.invoiceId}?cancelled=1`,
    payment_intent_data: {
      description: `${settings.brandName} · ${input.invoiceNumber}`,
    },
  });

  if (!session.url) throw new Error('Stripe did not return a checkout URL.');

  return {
    url: session.url,
    reference: session.id,
    expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
  };
}

export interface VerifiedEvent {
  id: string;
  type: string;
  invoiceId: string | null;
  reference: string | null;
  paid: boolean;
  raw: unknown;
}

/**
 * Verifies a webhook signature against the raw request body and normalises the
 * event. An unsigned or mis-signed payload throws, so a forged "payment
 * succeeded" call cannot mark an invoice paid.
 */
export function verifyWebhook(rawBody: Buffer, signature: string): VerifiedEvent {
  if (!env.stripeWebhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is not set.');

  const event = stripe().webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret);
  const object = event.data.object as unknown as Record<string, unknown>;
  const metadata = (object.metadata ?? {}) as Record<string, string>;

  const paid =
    event.type === 'checkout.session.completed' &&
    (object.payment_status === 'paid' || object.status === 'complete');

  return {
    id: event.id,
    type: event.type,
    invoiceId: metadata.invoiceId ?? (object.client_reference_id as string | undefined) ?? null,
    reference: (object.id as string | undefined) ?? null,
    paid,
    raw: event,
  };
}
