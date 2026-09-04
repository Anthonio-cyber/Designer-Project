import { createHmac, timingSafeEqual } from 'node:crypto';
import { env, paystackConfigured } from '../../config/env.js';
import type { CheckoutInput, CheckoutSession, VerifiedEvent } from './stripe.service.js';

const API = 'https://api.paystack.co';

export const isTestMode = (): boolean => env.paystackSecretKey.startsWith('sk_test_');

async function call<T>(path: string, init: RequestInit): Promise<T> {
  if (!paystackConfigured()) throw new Error('Paystack is not configured on this server.');

  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.paystackSecretKey}`,
      'content-type': 'application/json',
      ...(init.headers as Record<string, string>),
    },
  });

  const payload = (await response.json().catch(() => ({}))) as {
    status?: boolean;
    message?: string;
    data?: T;
  };

  if (!response.ok || payload.status === false) {
    throw new Error(payload.message ?? `Paystack returned ${response.status}`);
  }
  return payload.data as T;
}

/**
 * Initialises a Paystack transaction and returns its hosted checkout URL.
 * Paystack covers Nigeria, Ghana, South Africa, Kenya and Egypt, where Stripe
 * cannot settle to a local bank account.
 */
export async function createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
  const data = await call<{ authorization_url: string; reference: string }>(
    '/transaction/initialize',
    {
      method: 'POST',
      body: JSON.stringify({
        email: input.customerEmail,
        amount: input.amountMinor,
        currency: input.currency.toUpperCase(),
        reference: `${input.invoiceNumber}-${Date.now()}`.replace(/[^A-Za-z0-9-]/g, ''),
        callback_url: `${env.publicSiteUrl}/dashboard/invoices/${input.invoiceId}?paid=1`,
        metadata: {
          invoiceId: input.invoiceId,
          invoiceNumber: input.invoiceNumber,
          custom_fields: [
            { display_name: 'Invoice', variable_name: 'invoice', value: input.invoiceNumber },
          ],
        },
      }),
    },
  );

  return { url: data.authorization_url, reference: data.reference, expiresAt: null };
}

/** Confirms a transaction directly with Paystack rather than trusting a redirect. */
export async function verifyTransaction(reference: string): Promise<{ paid: boolean; amountMinor: number }> {
  const data = await call<{ status: string; amount: number }>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
    { method: 'GET' },
  );
  return { paid: data.status === 'success', amountMinor: data.amount };
}

/**
 * Paystack signs webhooks with HMAC-SHA512 of the raw body using the secret key.
 * Compared in constant time so the check cannot be probed by timing.
 */
export function verifyWebhook(rawBody: Buffer, signature: string): VerifiedEvent {
  if (!paystackConfigured()) throw new Error('Paystack is not configured on this server.');

  const expected = createHmac('sha512', env.paystackSecretKey).update(rawBody).digest('hex');
  const provided = Buffer.from(signature ?? '', 'utf8');
  const digest = Buffer.from(expected, 'utf8');

  if (provided.length !== digest.length || !timingSafeEqual(provided, digest)) {
    throw new Error('Invalid Paystack signature.');
  }

  const event = JSON.parse(rawBody.toString('utf8')) as {
    event: string;
    data: { id?: number; reference?: string; status?: string; metadata?: Record<string, string> };
  };

  return {
    id: String(event.data?.id ?? event.data?.reference ?? ''),
    type: event.event,
    invoiceId: event.data?.metadata?.invoiceId ?? null,
    reference: event.data?.reference ?? null,
    paid: event.event === 'charge.success' && event.data?.status === 'success',
    raw: event,
  };
}
