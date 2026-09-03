import { Router } from 'express';
import { z } from 'zod';
import { db, json } from '../db/index.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { uuid } from '../lib/ids.js';
import { rateLimit } from '../lib/rateLimit.js';
import { validateBody } from '../lib/validate.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAdmin } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';
import { getSettings } from '../services/settings.service.js';
import { ask, planFeature, TASK_LABELS, type AssistantTask } from '../services/ai/assistant.js';
import { aiConfigured } from '../services/ai/provider.js';
import { highestRisk, TOOLS, type ToolResult } from '../services/ai/tools.js';
import { env } from '../config/env.js';

export const aiRouter = Router();
aiRouter.use(requireAdmin);

/** Blocks every AI endpoint when the designer has switched the assistant off. */
aiRouter.use((_req, _res, next) => {
  if (!getSettings().aiSettings.enabled) {
    return next(forbidden('The AI assistant is disabled in Admin → Settings.'));
  }
  next();
});

const aiLimiter = rateLimit({ scope: 'ai', windowMs: 60_000, max: 20, message: 'Give the assistant a moment — too many requests.' });

aiRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    const settings = getSettings();
    res.json({
      configured: aiConfigured(),
      model: aiConfigured() ? env.aiModel : 'offline',
      requireApproval: settings.aiSettings.requireApproval,
      tone: settings.aiSettings.tone,
      tasks: Object.entries(TASK_LABELS).map(([value, label]) => ({ value, label })),
      tools: Object.values(TOOLS).map((tool) => ({
        name: tool.name,
        risk: tool.risk,
        summary: tool.summary,
      })),
    });
  }),
);

// ------------------------------------------------------------ conversation ---

aiRouter.get(
  '/conversations',
  asyncHandler(async (req, res) => {
    const rows = db
      .prepare(
        `SELECT id, title, created_at AS createdAt, updated_at AS updatedAt FROM ai_conversations
          WHERE admin_id = ? ORDER BY updated_at DESC LIMIT 50`,
      )
      .all(req.auth!.id);
    res.json({ conversations: rows });
  }),
);

aiRouter.get(
  '/conversations/:id',
  asyncHandler(async (req, res) => {
    const conversation = db
      .prepare(`SELECT id, title FROM ai_conversations WHERE id = ? AND admin_id = ?`)
      .get(req.params.id, req.auth!.id) as { id: string; title: string } | undefined;
    if (!conversation) throw notFound('Conversation not found.');

    const messages = db
      .prepare(
        `SELECT id, role, content, meta, created_at AS createdAt FROM ai_messages
          WHERE conversation_id = ? ORDER BY created_at ASC`,
      )
      .all(conversation.id) as Record<string, unknown>[];

    res.json({
      conversation,
      messages: messages.map((message) => ({ ...message, meta: json(message.meta, {}) })),
    });
  }),
);

aiRouter.delete(
  '/conversations/:id',
  asyncHandler(async (req, res) => {
    db.prepare(`DELETE FROM ai_conversations WHERE id = ? AND admin_id = ?`).run(req.params.id, req.auth!.id);
    res.json({ ok: true });
  }),
);

const askSchema = z.object({
  task: z.string().refine((value) => value in TASK_LABELS, 'Unknown assistant task.'),
  prompt: z.string().trim().min(2).max(6000),
  conversationId: z.string().uuid().nullable().optional(),
  clientConversationId: z.string().uuid().nullable().optional(),
  requestId: z.string().uuid().nullable().optional(),
});

aiRouter.post(
  '/ask',
  aiLimiter,
  validateBody(askSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof askSchema>;
    const adminId = req.auth!.id;

    let conversationId = input.conversationId ?? null;
    if (conversationId) {
      const owned = db
        .prepare(`SELECT id FROM ai_conversations WHERE id = ? AND admin_id = ?`)
        .get(conversationId, adminId);
      if (!owned) throw notFound('Conversation not found.');
    } else {
      conversationId = uuid();
      db.prepare(`INSERT INTO ai_conversations (id, admin_id, title) VALUES (?, ?, ?)`).run(
        conversationId,
        adminId,
        input.prompt.slice(0, 60),
      );
    }

    const history = db
      .prepare(
        `SELECT role, content FROM ai_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 10`,
      )
      .all(conversationId) as { role: 'user' | 'assistant'; content: string }[];

    db.prepare(`INSERT INTO ai_messages (id, conversation_id, role, content, meta) VALUES (?, ?, 'user', ?, ?)`).run(
      uuid(),
      conversationId,
      input.prompt,
      JSON.stringify({ task: input.task }),
    );

    const reply = await ask({
      task: input.task as AssistantTask,
      prompt: input.prompt,
      history: history.reverse(),
      conversationId: input.clientConversationId ?? undefined,
      requestId: input.requestId ?? undefined,
    });

    db.prepare(
      `INSERT INTO ai_messages (id, conversation_id, role, content, meta) VALUES (?, ?, 'assistant', ?, ?)`,
    ).run(uuid(), conversationId, reply.text, JSON.stringify({ live: reply.live, model: reply.model }));
    db.prepare(`UPDATE ai_conversations SET updated_at = datetime('now') WHERE id = ?`).run(conversationId);

    logActivity({
      actorId: adminId,
      actorType: 'ai',
      action: 'ai.answered',
      entityType: 'ai_conversation',
      entityId: conversationId,
      meta: { task: input.task, live: reply.live },
    });

    res.json({ conversationId, reply });
  }),
);

// ---------------------------------------------------------- feature builder ---

aiRouter.post(
  '/plan',
  aiLimiter,
  validateBody(z.object({ prompt: z.string().trim().min(4).max(2000) })),
  asyncHandler(async (req, res) => {
    const { prompt } = req.body as { prompt: string };
    const plan = await planFeature(prompt);

    const id = uuid();
    db.prepare(
      `INSERT INTO ai_actions (id, admin_id, prompt, summary, plan, risk, status)
       VALUES (?, ?, ?, ?, ?, ?, 'proposed')`,
    ).run(id, req.auth!.id, prompt, plan.summary, JSON.stringify(plan.steps), plan.risk);

    logActivity({
      actorId: req.auth!.id,
      actorType: 'ai',
      action: 'ai.plan_proposed',
      entityType: 'ai_action',
      entityId: id,
      meta: { summary: plan.summary, risk: plan.risk, steps: plan.steps.length },
    });

    res.status(201).json({ action: { id, status: 'proposed', ...plan } });
  }),
);

aiRouter.get(
  '/actions',
  asyncHandler(async (req, res) => {
    const rows = db
      .prepare(
        `SELECT a.id, a.prompt, a.summary, a.plan, a.risk, a.status, a.result, a.undo_payload AS undoPayload,
                a.created_at AS createdAt, a.applied_at AS appliedAt, a.undone_at AS undoneAt, u.name AS adminName
           FROM ai_actions a LEFT JOIN users u ON u.id = a.admin_id
          ORDER BY a.created_at DESC LIMIT 100`,
      )
      .all() as Record<string, unknown>[];

    res.json({
      actions: rows.map((row) => ({
        ...row,
        plan: json(row.plan, []),
        result: json(row.result, null),
        undoPayload: json(row.undoPayload, null),
      })),
    });
  }),
);

interface ActionRow {
  id: string;
  adminId: string;
  prompt: string;
  summary: string;
  plan: string;
  risk: 'read' | 'write' | 'dangerous';
  status: string;
}

function loadAction(id: string): ActionRow {
  const row = db
    .prepare(
      `SELECT id, admin_id AS adminId, prompt, summary, plan, risk, status FROM ai_actions WHERE id = ?`,
    )
    .get(id) as ActionRow | undefined;
  if (!row) throw notFound('That proposal no longer exists.');
  return row;
}

/**
 * Applies an approved plan. Every step is an allow-listed tool, executed inside a
 * single transaction so a failure halfway through leaves nothing half-applied.
 */
aiRouter.post(
  '/actions/:id/approve',
  asyncHandler(async (req, res) => {
    const action = loadAction(req.params.id);
    if (action.status !== 'proposed') throw badRequest('This proposal has already been answered.');

    const steps = json<{ tool: string; input: Record<string, unknown> }[]>(action.plan, []);
    if (steps.length === 0) throw badRequest('This proposal has no actions to apply.');

    const ctx = { actorId: req.auth!.id, actorName: req.auth!.name };
    const results: ToolResult[] = [];

    try {
      db.transaction(() => {
        for (const step of steps) {
          const tool = TOOLS[step.tool];
          // Re-checked at execution time: the stored plan cannot smuggle in a
          // tool that was removed or renamed since it was proposed.
          if (!tool) throw badRequest(`"${step.tool}" is not an approved action.`);
          results.push(tool.run(step.input ?? {}, ctx));
        }
      })();
    } catch (error) {
      db.prepare(
        `UPDATE ai_actions SET status = 'failed', result = ? WHERE id = ?`,
      ).run(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), action.id);
      throw error;
    }

    // Undo steps run in reverse so dependent changes unwind correctly.
    const undoPayload = results
      .map((result) => result.undo)
      .filter((undo): undo is { tool: string; input: Record<string, unknown> } => !!undo)
      .reverse();

    db.prepare(
      `UPDATE ai_actions SET status = 'applied', applied_at = datetime('now'), result = ?, undo_payload = ?
        WHERE id = ?`,
    ).run(
      JSON.stringify(results.map((result) => ({ message: result.message }))),
      JSON.stringify(undoPayload),
      action.id,
    );

    logActivity({
      actorId: req.auth!.id,
      actorType: 'admin',
      action: 'ai.plan_approved',
      entityType: 'ai_action',
      entityId: action.id,
      meta: { summary: action.summary, steps: steps.length },
    });

    res.json({
      ok: true,
      messages: results.map((result) => result.message),
      undoable: undoPayload.length > 0,
    });
  }),
);

aiRouter.post(
  '/actions/:id/reject',
  asyncHandler(async (req, res) => {
    const action = loadAction(req.params.id);
    if (action.status !== 'proposed') throw badRequest('This proposal has already been answered.');

    db.prepare(`UPDATE ai_actions SET status = 'rejected' WHERE id = ?`).run(action.id);
    logActivity({
      actorId: req.auth!.id,
      actorType: 'admin',
      action: 'ai.plan_rejected',
      entityType: 'ai_action',
      entityId: action.id,
      meta: { summary: action.summary },
    });
    res.json({ ok: true });
  }),
);

aiRouter.post(
  '/actions/:id/undo',
  asyncHandler(async (req, res) => {
    const row = db
      .prepare(`SELECT id, status, summary, undo_payload AS undoPayload FROM ai_actions WHERE id = ?`)
      .get(req.params.id) as { id: string; status: string; summary: string; undoPayload: string } | undefined;
    if (!row) throw notFound('That change no longer exists.');
    if (row.status !== 'applied') throw badRequest('Only an applied change can be undone.');

    const steps = json<{ tool: string; input: Record<string, unknown> }[]>(row.undoPayload, []);
    if (steps.length === 0) throw badRequest('This change cannot be undone automatically.');

    const ctx = { actorId: req.auth!.id, actorName: req.auth!.name };
    const messages: string[] = [];

    db.transaction(() => {
      for (const step of steps) {
        const tool = TOOLS[step.tool];
        if (!tool) throw badRequest(`"${step.tool}" is not an approved action.`);
        messages.push(tool.run(step.input ?? {}, ctx).message);
      }
    })();

    db.prepare(`UPDATE ai_actions SET status = 'undone', undone_at = datetime('now') WHERE id = ?`).run(row.id);
    logActivity({
      actorId: req.auth!.id,
      actorType: 'admin',
      action: 'ai.change_undone',
      entityType: 'ai_action',
      entityId: row.id,
      meta: { summary: row.summary },
    });

    res.json({ ok: true, messages });
  }),
);
