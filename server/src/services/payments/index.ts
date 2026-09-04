import { paystackConfigured, stripeConfigured } from '../../config/env.js';
import { getSettings } from '../settings.service.js';
import * as stripe from './stripe.service.js';
import * as paystack from './paystack.service.js';
import type { CheckoutInput, CheckoutSession, VerifiedEvent } from './stripe.service.js';

export * from './money.js';
export type { CheckoutInput, CheckoutSession, VerifiedEvent };

export type PaymentMethod = 'stripe' | 'paystack' | 'bank_transfer' | 'other';

export interface MethodStatus {
  method: PaymentMethod;
  label: string;
  /** Enabled by the designer in settings. */
  enabled: boolean;
  /** Has the credential it needs (bank transfer needs an account number, not a key). */
  configured: boolean;
  testMode: boolean;
  hint: string;
}

/** What a client can actually be offered right now, and why. */
export function availableMethods(): MethodStatus[] {
  const { payments } = getSettings();
  const bankReady = !!payments.bank.accountNumber && !!payments.bank.accountName;

  return [
    {
      method: 'stripe',
      label: 'Card payment (Stripe)',
      enabled: payments.stripeEnabled,
      configured: stripeConfigured(),
      testMode: stripeConfigured() && stripe.isTestMode(),
      hint: 'Cards, Apple Pay and Google Pay on a Stripe-hosted page.',
    },
    {
      method: 'paystack',
      label: 'Card & transfer (Paystack)',
      enabled: payments.paystackEnabled,
      configured: paystackConfigured(),
      testMode: paystackConfigured() && paystack.isTestMode(),
      hint: 'Cards, bank transfer and USSD across Nigeria, Ghana, South Africa, Kenya and Egypt.',
    },
    {
      method: 'bank_transfer',
      label: 'Direct bank transfer',
      enabled: payments.bankTransferEnabled,
      configured: bankReady,
      testMode: false,
      hint: 'Your account details appear on the invoice; you confirm receipt manually.',
    },
  ];
}

export function isMethodUsable(method: PaymentMethod): boolean {
  const status = availableMethods().find((entry) => entry.method === method);
  return !!status && status.enabled && status.configured;
}

/** Routes a checkout to whichever hosted provider the invoice uses. */
export async function createCheckout(
  method: PaymentMethod,
  input: CheckoutInput,
): Promise<CheckoutSession> {
  if (method === 'stripe') return stripe.createCheckout(input);
  if (method === 'paystack') return paystack.createCheckout(input);
  throw new Error(`${method} is settled outside the app and has no checkout page.`);
}

export function verifyWebhook(
  provider: 'stripe' | 'paystack',
  rawBody: Buffer,
  signature: string,
): VerifiedEvent {
  return provider === 'stripe'
    ? stripe.verifyWebhook(rawBody, signature)
    : paystack.verifyWebhook(rawBody, signature);
}

export { stripe, paystack };
