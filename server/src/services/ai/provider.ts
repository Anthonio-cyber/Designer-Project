import { env } from '../../config/env.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface CompletionResult {
  text: string;
  /** False when the request was served by the offline fallback. */
  live: boolean;
  model: string;
}

export const aiConfigured = (): boolean => env.anthropicApiKey.length > 0;

/**
 * Server-side call to the Anthropic Messages API. The API key lives only in the
 * server process; the browser never sees it and never talks to the AI provider
 * directly. When no key is configured the caller falls back to local heuristics
 * so the assistant still returns something useful.
 */
export async function complete(request: CompletionRequest): Promise<CompletionResult> {
  if (!aiConfigured()) {
    return { text: '', live: false, model: 'offline' };
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.aiModel,
      max_tokens: request.maxTokens ?? env.aiMaxTokens,
      temperature: request.temperature ?? 0.6,
      system: request.system,
      messages: request.messages.map((message) => ({
        role: message.role,
        content: [{ type: 'text', text: message.content }],
      })),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`AI provider returned ${response.status}: ${detail.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = (payload.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('\n')
    .trim();

  return { text, live: true, model: env.aiModel };
}

/** Extracts the first JSON object from a model response that may include prose. */
export function extractJson<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
