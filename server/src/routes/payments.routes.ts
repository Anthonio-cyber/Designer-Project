import { Router, raw } from 'express';
import { db } from '../db/index.js';
import { uuid } from '../lib/ids.js';
import { asyncHandler } from '../middleware/error.js';
import { verifyWebhook } from '../services/payments/index.js';
import { markPaid } from './invoices.routes.js';

export const paymentsRouter = Router();

/**
 * Provider webhooks. These are the only public write endpoints in the app, so:
 *   - the raw body is preserved and the signature verified before anything is
 *     read from the payload — a forged "paid" call cannot mark an invoice paid;
 *   - every accepted event id is stored with a unique index, so a replay or a
 *     provider retry is a no-op rather than a double credit;
 *   - the response is always 200 once a payload is understood, otherwise the
 *     provider keeps retrying forever.
 */
function handler(provider: 'stripe' | 'paystack') {
  return asyncHandler(async (req, res) => {
    const signature =
      provider === 'stripe'
        ? (req.headers['stripe-signature'] as string | undefined)
        : (req.headers['x-paystack-signature'] as string | undefined);

    if (!signature) {
      res.status(400).json({ error: { code: 'bad_request', message: 'Missing signature header.' } });
      return;
    }

    let event;
    try {
      event = verifyWebhook(provider, req.body as Buffer, signature);
    } catch (error) {
      console.warn(`[payments] rejected ${provider} webhook:`, error instanceof Error ? error.message : error);
      res.status(400).json({ error: { code: 'invalid_signature', message: 'Signature check failed.' } });
      return;
    }

    const inserted = db
      .prepare(
        `INSERT OR IGNORE INTO payment_events (id, provider, event_id, event_type, invoice_id, payload)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        uuid(),
        provider,
        event.id || `${provider}-${Date.now()}`,
        event.type,
        event.invoiceId,
        JSON.stringify(event.raw).slice(0, 20_000),
      );

    // Already processed: acknowledge and stop.
    if (inserted.changes === 0) {
      res.json({ received: true, duplicate: true });
      return;
    }

    if (event.paid && event.invoiceId) {
      markPaid(event.invoiceId, provider, event.reference, null);
    }

    res.json({ received: true });
  });
}

// The JSON body parser is skipped here: signature verification needs the exact
// bytes the provider signed.
paymentsRouter.post('/webhook/stripe', raw({ type: '*/*', limit: '1mb' }), handler('stripe'));
paymentsRouter.post('/webhook/paystack', raw({ type: '*/*', limit: '1mb' }), handler('paystack'));
