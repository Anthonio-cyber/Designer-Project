import { Router, type Request } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { uuid } from '../lib/ids.js';
import { rateLimit } from '../lib/rateLimit.js';
import { validateBody } from '../lib/validate.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';
import { getSettings } from '../services/settings.service.js';
import { notify, notifyAdmins } from '../services/notifications.service.js';
import { adminRecipients, sendEmailAsync, templates } from '../services/email/index.js';
import {
  availableMethods,
  createCheckout,
  formatMoney,
  isMethodUsable,
  toMinor,
  type PaymentMethod,
} from '../services/payments/index.js';

export const invoicesRouter = Router();

const SELECT = `
  SELECT i.id, i.number, i.client_id AS clientId, i.project_id AS projectId, i.service_id AS serviceId,
         i.title, i.description, i.amount_minor AS amountMinor, i.currency, i.method, i.status,
         i.due_date AS dueDate, i.notes, i.provider_ref AS providerRef, i.checkout_url AS checkoutUrl,
         i.paid_at AS paidAt, i.paid_method AS paidMethod, i.sent_at AS sentAt,
         i.created_at AS createdAt, i.updated_at AS updatedAt,
         u.name AS clientName, u.email AS clientEmail,
         p.title AS projectTitle, p.code AS projectCode, s.name AS serviceName
    FROM invoices i
    JOIN users u ON u.id = i.client_id
    LEFT JOIN client_projects p ON p.id = i.project_id
    LEFT JOIN services s ON s.id = i.service_id`;

interface InvoiceRow {
  id: string;
  number: string;
  clientId: string;
  amountMinor: number;
  currency: string;
  method: PaymentMethod;
  status: string;
  clientEmail: string;
  clientName: string;
  title: string;
  description: string | null;
  checkoutUrl: string | null;
  [key: string]: unknown;
}

/**
 * Bank details are attached only to an invoice the viewer is entitled to see,
 * and only when that invoice is actually settled by transfer — they are never
 * part of the public settings payload.
 */
function serializeInvoice(row: InvoiceRow, opts: { includeBank?: boolean } = {}) {
  const settings = getSettings();
  const showBank =
    opts.includeBank && row.method === 'bank_transfer' && settings.payments.bankTransferEnabled;

  return {
    ...row,
    amount: formatMoney(row.amountMinor, row.currency),
    amountMajor: row.amountMinor / (row.currency.toUpperCase() === 'JPY' ? 1 : 100),
    bank: showBank ? settings.payments.bank : null,
    paymentTerms: settings.payments.paymentTerms,
    invoiceFooter: settings.payments.invoiceFooter,
  };
}

function nextInvoiceNumber(): string {
  const prefix = (getSettings().payments.invoicePrefix || 'INV').replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
  const year = new Date().getUTCFullYear();
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM invoices WHERE number LIKE ?`)
    .get(`${prefix}-${year}-%`) as { n: number };
  return `${prefix}-${year}-${String(row.n + 1).padStart(4, '0')}`;
}

/** Loads an invoice the viewer may see: their own, or any of them for an admin. */
function authorizeInvoice(id: string, viewer: { id: string; role: 'client' | 'admin' }): InvoiceRow {
  const row = db.prepare(`${SELECT} WHERE i.id = ? OR i.number = ?`).get(id, id) as InvoiceRow | undefined;
  if (!row) throw notFound('Invoice not found.');
  if (viewer.role !== 'admin' && row.clientId !== viewer.id) {
    throw forbidden('That invoice belongs to another client.');
  }
  return row;
}

// ---------------------------------------------------------------- reading ---

invoicesRouter.get(
  '/methods',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const settings = getSettings();
    res.json({
      enabled: settings.payments.enabled,
      currency: settings.payments.currency,
      methods: availableMethods(),
    });
  }),
);

invoicesRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const viewer = req.auth!;
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : '';

    const rows = db
      .prepare(
        `${SELECT}
          WHERE (@role = 'admin' OR i.client_id = @viewerId)
            AND (@role = 'admin' OR i.status != 'draft')
            AND (@clientId = '' OR i.client_id = @clientId)
            AND (@status = '' OR i.status = @status)
          ORDER BY i.created_at DESC LIMIT 300`,
      )
      .all({ role: viewer.role, viewerId: viewer.id, clientId, status }) as InvoiceRow[];

    const totals = rows.reduce(
      (accumulator, row) => {
        if (row.status === 'paid') accumulator.paid += row.amountMinor;
        else if (row.status === 'sent') accumulator.outstanding += row.amountMinor;
        return accumulator;
      },
      { paid: 0, outstanding: 0 },
    );

    res.json({
      invoices: rows.map((row) => serializeInvoice(row)),
      totals: {
        paidMinor: totals.paid,
        outstandingMinor: totals.outstanding,
        paid: formatMoney(totals.paid),
        outstanding: formatMoney(totals.outstanding),
      },
    });
  }),
);

invoicesRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const invoice = authorizeInvoice(req.params.id, req.auth!);
    if (req.auth!.role !== 'admin' && invoice.status === 'draft') throw notFound('Invoice not found.');
    res.json({ invoice: serializeInvoice(invoice, { includeBank: true }) });
  }),
);

// ---------------------------------------------------------------- writing ---

const createSchema = z.object({
  clientId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  serviceId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(2).max(140),
  description: z.string().trim().max(2000).nullable().optional(),
  amount: z.coerce.number().min(0.5).max(10_000_000),
  currency: z.string().trim().length(3).optional(),
  method: z.enum(['stripe', 'paystack', 'bank_transfer', 'other']),
  dueDate: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  send: z.boolean().default(false),
});

invoicesRouter.post(
  '/',
  requireAdmin,
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof createSchema>;
    const settings = getSettings();

    const client = db
      .prepare(`SELECT id, name, email, role FROM users WHERE id = ?`)
      .get(input.clientId) as { id: string; name: string; email: string; role: string } | undefined;
    if (!client || client.role !== 'client') throw badRequest('Choose a valid client account.');

    if (input.method !== 'other' && !isMethodUsable(input.method)) {
      throw badRequest(
        `${input.method.replace('_', ' ')} is not available. Enable and configure it in Settings → Payments first.`,
      );
    }

    const currency = (input.currency ?? settings.payments.currency).toUpperCase();
    const id = uuid();
    const number = nextInvoiceNumber();

    db.prepare(
      `INSERT INTO invoices (id, number, client_id, project_id, service_id, title, description,
                             amount_minor, currency, method, status, due_date, notes, sent_at)
       VALUES (@id, @number, @clientId, @projectId, @serviceId, @title, @description,
               @amountMinor, @currency, @method, @status, @dueDate, @notes, @sentAt)`,
    ).run({
      id,
      number,
      clientId: input.clientId,
      projectId: input.projectId ?? null,
      serviceId: input.serviceId ?? null,
      title: input.title,
      description: input.description ?? null,
      amountMinor: toMinor(input.amount, currency),
      currency,
      method: input.method,
      status: input.send ? 'sent' : 'draft',
      dueDate: input.dueDate ?? null,
      notes: input.notes ?? null,
      sentAt: input.send ? new Date().toISOString() : null,
    });

    const invoice = db.prepare(`${SELECT} WHERE i.id = ?`).get(id) as InvoiceRow;
    if (input.send) notifyClientOfInvoice(invoice);

    logActivity({
      actorId: req.auth!.id,
      actorType: 'admin',
      action: input.send ? 'invoice.sent' : 'invoice.created',
      entityType: 'invoice',
      entityId: id,
      meta: { number, amount: formatMoney(invoice.amountMinor, currency), method: input.method },
    });

    res.status(201).json({ invoice: serializeInvoice(invoice, { includeBank: true }) });
  }),
);

invoicesRouter.patch(
  '/:id',
  requireAdmin,
  validateBody(
    z.object({
      title: z.string().trim().min(2).max(140).optional(),
      description: z.string().trim().max(2000).nullable().optional(),
      amount: z.coerce.number().min(0.5).max(10_000_000).optional(),
      method: z.enum(['stripe', 'paystack', 'bank_transfer', 'other']).optional(),
      dueDate: z.string().trim().max(40).nullable().optional(),
      notes: z.string().trim().max(2000).nullable().optional(),
      status: z.enum(['draft', 'sent', 'cancelled']).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const invoice = authorizeInvoice(req.params.id, req.auth!);
    if (invoice.status === 'paid') throw conflict('A paid invoice cannot be edited.');

    const input = req.body as Record<string, unknown>;
    db.prepare(
      `UPDATE invoices SET
         title = COALESCE(@title, title),
         description = COALESCE(@description, description),
         amount_minor = COALESCE(@amountMinor, amount_minor),
         method = COALESCE(@method, method),
         due_date = COALESCE(@dueDate, due_date),
         notes = COALESCE(@notes, notes),
         status = COALESCE(@status, status),
         -- any change invalidates a checkout page created for the old amount
         checkout_url = CASE WHEN @amountMinor IS NULL AND @method IS NULL THEN checkout_url ELSE NULL END,
         updated_at = datetime('now')
       WHERE id = @id`,
    ).run({
      id: invoice.id,
      title: (input.title as string) ?? null,
      description: (input.description as string) ?? null,
      amountMinor: input.amount === undefined ? null : toMinor(input.amount as number, invoice.currency),
      method: (input.method as string) ?? null,
      dueDate: (input.dueDate as string) ?? null,
      notes: (input.notes as string) ?? null,
      status: (input.status as string) ?? null,
    });

    logActivity({
      actorId: req.auth!.id,
      actorType: 'admin',
      action: 'invoice.updated',
      entityType: 'invoice',
      entityId: invoice.id,
      meta: { number: invoice.number, fields: Object.keys(input) },
    });

    const updated = db.prepare(`${SELECT} WHERE i.id = ?`).get(invoice.id) as InvoiceRow;
    res.json({ invoice: serializeInvoice(updated, { includeBank: true }) });
  }),
);

/** Marks a draft as sent and emails the client. */
invoicesRouter.post(
  '/:id/send',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const invoice = authorizeInvoice(req.params.id, req.auth!);
    if (invoice.status === 'paid') throw conflict('That invoice is already paid.');

    db.prepare(
      `UPDATE invoices SET status = 'sent', sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
    ).run(invoice.id);

    const updated = db.prepare(`${SELECT} WHERE i.id = ?`).get(invoice.id) as InvoiceRow;
    notifyClientOfInvoice(updated);

    logActivity({
      actorId: req.auth!.id,
      actorType: 'admin',
      action: 'invoice.sent',
      entityType: 'invoice',
      entityId: invoice.id,
      meta: { number: invoice.number },
    });
    res.json({ invoice: serializeInvoice(updated, { includeBank: true }) });
  }),
);

/** Manual confirmation for a bank transfer that landed outside the app. */
invoicesRouter.post(
  '/:id/mark-paid',
  requireAdmin,
  validateBody(z.object({ reference: z.string().trim().max(120).optional() })),
  asyncHandler(async (req, res) => {
    const invoice = authorizeInvoice(req.params.id, req.auth!);
    if (invoice.status === 'paid') throw conflict('That invoice is already marked paid.');

    markPaid(invoice.id, invoice.method, (req.body as { reference?: string }).reference ?? null, req.auth!.id);

    logActivity({
      actorId: req.auth!.id,
      actorType: 'admin',
      action: 'invoice.marked_paid',
      entityType: 'invoice',
      entityId: invoice.id,
      meta: { number: invoice.number, method: invoice.method },
    });

    const updated = db.prepare(`${SELECT} WHERE i.id = ?`).get(invoice.id) as InvoiceRow;
    res.json({ invoice: serializeInvoice(updated, { includeBank: true }) });
  }),
);

invoicesRouter.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const invoice = authorizeInvoice(req.params.id, req.auth!);
    if (invoice.status === 'paid') throw conflict('A paid invoice cannot be deleted — cancel it instead.');

    db.prepare(`DELETE FROM invoices WHERE id = ?`).run(invoice.id);
    logActivity({
      actorId: req.auth!.id,
      actorType: 'admin',
      action: 'invoice.deleted',
      entityType: 'invoice',
      entityId: invoice.id,
      meta: { number: invoice.number },
    });
    res.json({ ok: true });
  }),
);

/**
 * Creates (or reuses) the hosted checkout page for an invoice. Only the client
 * the invoice belongs to can start a payment for it.
 */
invoicesRouter.post(
  '/:id/checkout',
  requireAuth,
  rateLimit({ scope: 'checkout', windowMs: 60_000, max: 12 }),
  asyncHandler(async (req, res) => {
    const invoice = authorizeInvoice(req.params.id, req.auth!);

    if (invoice.status === 'paid') throw badRequest('That invoice is already paid.');
    if (invoice.status === 'cancelled') throw badRequest('That invoice was cancelled.');
    if (invoice.status === 'draft') throw badRequest('That invoice has not been issued yet.');
    if (invoice.method === 'bank_transfer' || invoice.method === 'other') {
      throw badRequest('This invoice is settled by transfer — the account details are on the invoice.');
    }
    if (!isMethodUsable(invoice.method)) {
      throw badRequest('That payment method is not available right now. Contact the studio.');
    }

    const session = await createCheckout(invoice.method, {
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      title: invoice.title,
      description: invoice.description,
      amountMinor: invoice.amountMinor,
      currency: invoice.currency,
      customerEmail: invoice.clientEmail,
    });

    db.prepare(
      `UPDATE invoices SET checkout_url = ?, provider_ref = ?, checkout_expires_at = ?, updated_at = datetime('now')
        WHERE id = ?`,
    ).run(session.url, session.reference, session.expiresAt, invoice.id);

    res.json({ url: session.url });
  }),
);

// ----------------------------------------------------------------- shared ---

/** Records payment once, and notifies both sides. Safe to call twice. */
export function markPaid(
  invoiceId: string,
  method: string,
  reference: string | null,
  adminId: string | null,
): boolean {
  const changed = db
    .prepare(
      `UPDATE invoices SET status = 'paid', paid_at = datetime('now'), paid_method = @method,
              provider_ref = COALESCE(@reference, provider_ref), marked_paid_by = @adminId,
              updated_at = datetime('now')
        WHERE id = @id AND status != 'paid'`,
    )
    .run({ id: invoiceId, method, reference, adminId }).changes;

  if (changed === 0) return false;

  const invoice = db.prepare(`${SELECT} WHERE i.id = ?`).get(invoiceId) as InvoiceRow | undefined;
  if (!invoice) return true;

  const amount = formatMoney(invoice.amountMinor, invoice.currency);

  notify({
    userId: invoice.clientId,
    type: 'system',
    title: `Payment received for ${invoice.number}`,
    body: `${amount} — thank you.`,
    link: `/dashboard/invoices/${invoice.id}`,
  });
  sendEmailAsync({
    to: invoice.clientEmail,
    template: 'payment-received-client',
    notifyKey: 'invoice',
    email: templates.paymentReceived({
      number: invoice.number,
      amount,
      clientName: invoice.clientName,
      toAdmin: false,
    }),
  });

  notifyAdmins({
    type: 'system',
    title: `${invoice.clientName} paid ${invoice.number}`,
    body: amount,
    link: `/admin/invoices`,
  });
  for (const admin of adminRecipients()) {
    sendEmailAsync({
      to: admin.email,
      template: 'payment-received-admin',
      notifyKey: 'invoice',
      email: templates.paymentReceived({
        number: invoice.number,
        amount,
        clientName: invoice.clientName,
        toAdmin: true,
      }),
    });
  }

  logActivity({
    actorId: adminId,
    actorType: adminId ? 'admin' : 'system',
    action: 'invoice.paid',
    entityType: 'invoice',
    entityId: invoice.id,
    meta: { number: invoice.number, amount, method },
  });
  return true;
}

function notifyClientOfInvoice(invoice: InvoiceRow): void {
  const settings = getSettings();
  const amount = formatMoney(invoice.amountMinor, invoice.currency);
  const bank =
    invoice.method === 'bank_transfer' && settings.payments.bankTransferEnabled
      ? [
          { label: 'Account name', value: settings.payments.bank.accountName },
          { label: 'Account number', value: settings.payments.bank.accountNumber },
          { label: 'Bank', value: settings.payments.bank.bankName },
        ].filter((entry) => entry.value)
      : undefined;

  notify({
    userId: invoice.clientId,
    type: 'system',
    title: `Invoice ${invoice.number} — ${amount}`,
    body: invoice.title,
    link: `/dashboard/invoices/${invoice.id}`,
  });

  sendEmailAsync({
    to: invoice.clientEmail,
    template: 'invoice',
    notifyKey: 'invoice',
    email: templates.invoice({
      number: invoice.number,
      title: invoice.title,
      amount,
      dueDate: invoice.dueDate as string | null,
      method:
        invoice.method === 'bank_transfer'
          ? 'Bank transfer'
          : invoice.method === 'other'
            ? 'Arranged with the studio'
            : 'Card payment',
      invoiceId: invoice.id,
      bank,
    }),
  });
}

export { SELECT as INVOICE_SELECT };
export type { InvoiceRow };
