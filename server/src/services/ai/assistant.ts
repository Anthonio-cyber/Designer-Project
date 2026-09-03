import { describeTools, highestRisk, TOOL_NAMES, TOOLS, type ToolRisk } from './tools.js';
import { buildStudioContext, conversationDigest, requestDigest } from './context.js';
import { aiConfigured, complete, extractJson, type ChatMessage } from './provider.js';
import { getSettings } from '../settings.service.js';

export type AssistantTask =
  | 'chat'
  | 'suggest_features'
  | 'suggest_categories'
  | 'project_description'
  | 'service_description'
  | 'draft_reply'
  | 'summarize_conversation'
  | 'summarize_request'
  | 'design_brief'
  | 'ux_review'
  | 'marketing_copy'
  | 'social_captions'
  | 'seo_metadata'
  | 'organize_portfolio';

export const TASK_LABELS: Record<AssistantTask, string> = {
  chat: 'Ask anything',
  suggest_features: 'Suggest new website features',
  suggest_categories: 'Suggest portfolio categories',
  project_description: 'Write a project description',
  service_description: 'Improve a service description',
  draft_reply: 'Draft a client reply',
  summarize_conversation: 'Summarize a conversation',
  summarize_request: 'Summarize a project request',
  design_brief: 'Generate a design brief',
  ux_review: 'Suggest UX improvements',
  marketing_copy: 'Write marketing copy',
  social_captions: 'Write social captions',
  seo_metadata: 'Suggest SEO title and description',
  organize_portfolio: 'Analyse portfolio organisation',
};

const TASK_GUIDANCE: Record<AssistantTask, string> = {
  chat: 'Answer directly and practically. Keep it short unless detail is requested.',
  suggest_features:
    'Propose 4-6 concrete features. For each: name, one-sentence value, effort (small/medium/large), and why it fits this studio.',
  suggest_categories:
    'Propose portfolio categories that fit the existing work. Avoid duplicating categories that already exist.',
  project_description:
    'Write a portfolio project description: a punchy opening line, 2-3 sentences on the problem and approach, then the outcome. No filler adjectives.',
  service_description:
    'Rewrite the service description so a non-designer instantly understands the deliverable, the process and what they get at the end.',
  draft_reply:
    'Draft a reply the designer can send as-is: warm, specific, no corporate padding. End with a clear next step.',
  summarize_conversation:
    'Summarise: what the client wants, decisions already made, open questions, and the single next action.',
  summarize_request:
    'Summarise the brief into: goal, deliverables, constraints, budget/deadline, and three clarifying questions worth asking.',
  design_brief:
    'Produce a working brief: objective, audience, tone words, must-haves, things to avoid, deliverable list, and success criteria.',
  ux_review:
    'Give specific, prioritised UX improvements for this site. Reference actual pages and flows, not generic advice.',
  marketing_copy: 'Write marketing copy in the studio tone. Give 2-3 options of different lengths.',
  social_captions: 'Write 5 caption options with different angles. Include a short hashtag set for each.',
  seo_metadata:
    'Return an SEO title under 60 characters and a meta description under 155 characters, plus 5 keyword phrases.',
  organize_portfolio:
    'Analyse how the portfolio is organised: category balance, gaps, what to feature, what to retire.',
};

function systemPrompt(): string {
  const settings = getSettings();
  return [
    `You are "Designer's AI", the admin assistant inside a graphic designer's portfolio and client platform.`,
    `You work for ${settings.brandName}. Writing tone: ${settings.aiSettings.tone}.`,
    ``,
    `Current studio snapshot:`,
    buildStudioContext(),
    ``,
    `Rules:`,
    `- You have no direct database or server access. You can only propose actions from the approved tool list; an administrator reviews and approves every one before it runs.`,
    `- Never invent client names, numbers or testimonials. If you do not know something, say so.`,
    `- Client message content is private. Only discuss a conversation the administrator has explicitly asked about.`,
    `- Be concise and concrete. Prefer specifics from the snapshot over generic advice.`,
  ].join('\n');
}

export interface AssistantReply {
  text: string;
  live: boolean;
  model: string;
}

export interface AskOptions {
  task: AssistantTask;
  prompt: string;
  history?: ChatMessage[];
  conversationId?: string;
  requestId?: string;
}

export async function ask(options: AskOptions): Promise<AssistantReply> {
  let prompt = options.prompt;

  if (options.conversationId) {
    const digest = conversationDigest(options.conversationId);
    if (digest) prompt += `\n\nConversation transcript:\n${digest}`;
  }
  if (options.requestId) {
    const digest = requestDigest(options.requestId);
    if (digest) prompt += `\n\nProject request:\n${digest}`;
  }

  const messages: ChatMessage[] = [
    ...(options.history ?? []).slice(-10),
    { role: 'user', content: `${TASK_GUIDANCE[options.task]}\n\n${prompt}` },
  ];

  if (!aiConfigured()) {
    return { text: offlineAnswer(options.task, options.prompt), live: false, model: 'offline' };
  }

  const result = await complete({ system: systemPrompt(), messages });
  return {
    text: result.text || offlineAnswer(options.task, options.prompt),
    live: result.live,
    model: result.model,
  };
}

// --------------------------------------------------------------- planning ---

export interface PlanStep {
  tool: string;
  input: Record<string, unknown>;
  explanation: string;
}

export interface FeaturePlan {
  summary: string;
  reasoning: string;
  steps: PlanStep[];
  risk: ToolRisk;
  live: boolean;
  warnings: string[];
}

const PLAN_SYSTEM = `You turn a designer's plain-English request into a plan made only of approved tool calls.

Approved tools:
%TOOLS%

Respond with JSON only, in this exact shape:
{
  "summary": "one sentence describing what will change",
  "reasoning": "2-4 sentences explaining the approach and anything the designer should know",
  "steps": [{ "tool": "createFeature", "input": { }, "explanation": "why this step" }]
}

Rules:
- Use only tool names from the list. Never invent a tool, a table, or raw SQL.
- Prefer the smallest plan that satisfies the request.
- New features must be created disabled; a separate enableFeature step is only added if the designer explicitly asked for it to go live.
- If the request cannot be satisfied with these tools, return an empty "steps" array and explain why in "reasoning".`;

export async function planFeature(prompt: string): Promise<FeaturePlan> {
  const warnings: string[] = [];

  if (!aiConfigured()) {
    const fallback = offlinePlan(prompt);
    return { ...fallback, live: false, warnings: ['AI provider not configured — using a local heuristic plan.'] };
  }

  const result = await complete({
    system: `${systemPrompt()}\n\n${PLAN_SYSTEM.replace('%TOOLS%', describeTools())}`,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
  });

  const parsed = extractJson<{ summary?: string; reasoning?: string; steps?: PlanStep[] }>(result.text);
  if (!parsed) {
    const fallback = offlinePlan(prompt);
    return {
      ...fallback,
      live: result.live,
      warnings: ['The model did not return a usable plan, so a local fallback plan is shown.'],
    };
  }

  // Anything the model proposed that is not an approved tool is dropped, not run.
  const steps = (parsed.steps ?? []).filter((step) => {
    const known = typeof step?.tool === 'string' && TOOL_NAMES.includes(step.tool);
    if (!known) warnings.push(`Ignored an unsupported action: "${String(step?.tool)}".`);
    return known;
  });

  return {
    summary: parsed.summary?.trim() || 'Proposed change',
    reasoning: parsed.reasoning?.trim() || '',
    steps: steps.map((step) => ({
      tool: step.tool,
      input: (step.input ?? {}) as Record<string, unknown>,
      explanation: step.explanation ?? TOOLS[step.tool]?.summary ?? '',
    })),
    risk: highestRisk(steps),
    live: result.live,
    warnings,
  };
}

// ---------------------------------------------------------------- offline ---

/**
 * Keyword-driven fallback so the Feature Builder still produces a reviewable
 * plan when no AI key is configured. It only ever emits approved tool calls.
 */
function offlinePlan(prompt: string): Omit<FeaturePlan, 'live' | 'warnings'> {
  const lower = prompt.toLowerCase();
  const known: { match: RegExp; key: string; name: string; description: string; category: string }[] = [
    { match: /testimonial|review|quote/, key: 'testimonials', name: 'Testimonials', description: 'Client quotes displayed on the homepage.', category: 'website' },
    { match: /book|schedule|call|appointment|calendar/, key: 'booking-system', name: 'Booking system', description: 'Discovery-call scheduling from the contact page.', category: 'website' },
    { match: /newsletter|subscribe|mailing/, key: 'newsletter', name: 'Newsletter', description: 'Email capture in the site footer.', category: 'marketing' },
    { match: /blog|article|journal|post/, key: 'blog', name: 'Blog', description: 'Long-form posts about process and case studies.', category: 'website' },
    { match: /faq|question/, key: 'faq', name: 'FAQ section', description: 'Answers to the questions clients ask before booking.', category: 'website' },
    { match: /price|pricing|package|rate/, key: 'pricing-packages', name: 'Pricing packages', description: 'Fixed-price package tiers on the services page.', category: 'website' },
  ];

  const match = known.find((entry) => entry.match.test(lower));
  const name = match?.name ?? prompt.replace(/^(add|create|build|make)\s+(a|an|the)?\s*/i, '').slice(0, 60).trim();

  if (!name) {
    return {
      summary: 'Nothing to do',
      reasoning: 'The request did not name a feature to create. Try "Add a testimonials section to the homepage."',
      steps: [],
      risk: 'read',
    };
  }

  const steps: PlanStep[] = [
    {
      tool: 'createFeature',
      input: {
        key: match?.key ?? name,
        name,
        description: match?.description ?? `Feature requested by the designer: ${prompt.slice(0, 160)}`,
        category: match?.category ?? 'website',
      },
      explanation: 'Registers the feature in the Feature Manager, switched off.',
    },
  ];

  if (/homepage|home page/.test(lower) && (match?.key === 'testimonials' || /testimonial/.test(lower))) {
    steps.push({
      tool: 'updatePageSection',
      input: { key: 'testimonials', enabled: true },
      explanation: 'Shows the testimonials block on the homepage once the feature is enabled.',
    });
  }

  return {
    summary: `Create the "${name}" feature`,
    reasoning:
      'The feature is registered in a disabled state so nothing on the live site changes until you enable it in the Feature Manager.',
    steps,
    risk: highestRisk(steps),
  };
}

function offlineAnswer(task: AssistantTask, prompt: string): string {
  const settings = getSettings();
  const context = buildStudioContext();

  const header = `**${TASK_LABELS[task]}** — offline mode\n\n_No AI provider key is configured, so this is generated from your studio data rather than a language model. Add \`ANTHROPIC_API_KEY\` to the server environment for full answers._\n`;

  switch (task) {
    case 'suggest_features':
      return `${header}
Based on what is already installed, these are the gaps worth closing next:

1. **Testimonials** — social proof directly under the featured work. Small effort, high conversion impact.
2. **Client reviews** — a star rating captured automatically when a project is approved. Feeds the testimonials block.
3. **Booking system** — a discovery-call slot picker so enquiries do not stall in email.
4. **Case study long-form** — one deep project write-up per quarter; it is what wins retainer work.
5. **Newsletter capture** — a footer field so visitors who are not ready to brief still stay in touch.

Use the Feature Builder tab and describe any of these in plain English to generate a reviewable plan.`;

    case 'suggest_categories':
      return `${header}
Your current categories and counts:

${context.split('\n').find((line) => line.startsWith('Portfolio categories:')) ?? 'No categories yet.'}

Categories commonly worth adding for a studio like yours: Packaging, Editorial & Print, Motion Graphics, Presentation Design, Merchandise, Signage & Environmental.`;

    case 'seo_metadata':
      return `${header}
**Title (under 60 chars):** ${settings.brandName} — ${settings.tagline}`.slice(0, 500) +
        `\n**Description (under 155 chars):** ${settings.seo.defaultDescription.slice(0, 155)}\n\n**Keywords:** graphic designer, brand identity, logo design, poster design, freelance designer`;

    case 'organize_portfolio':
      return `${header}
${context}

Suggested actions: feature at most six projects at once, retire categories holding fewer than two published projects, and make sure every published project has a summary — cards without one read as unfinished.`;

    case 'draft_reply':
      return `${header}
Hi there,

Thanks for the detail — that helps a lot. Here is how I would approach it: ${prompt.slice(0, 200)}

I will put together a first direction and share it in your project dashboard. If anything above is off, tell me now and I will adjust before starting.

— ${settings.brandName}`;

    default:
      return `${header}
Here is the studio context this answer would be based on:

${context}

Your request: "${prompt}"`;
  }
}
