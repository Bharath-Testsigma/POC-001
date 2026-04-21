import { NextRequest } from 'next/server';
import { z } from 'zod';
import { mapMessageToUIEvents } from '@/lib/agent/events';
import { startAttoQuery } from '@/lib/agent/atto-session';
import type { UIEvent } from '@/lib/types/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  appType: z.string().default('web'),
  model: z.string().min(1, 'Model is required'),
  sessionId: z.string().optional(),
  thinkingBudget: z.number().int().min(0).max(64000).optional(),
});

function humaniseAgentError(raw: string, model: string): string {
  if (raw.includes('Cannot reach Ollama') || raw.includes('ollama serve')) {
    return `Ollama is not running. Start it with: ollama serve — then reload and try again.`;
  }
  if (raw.includes('exit code 1') || raw.includes('exited with code 1')) {
    if (model.startsWith('ollama:')) {
      return `Ollama model failed. Make sure Ollama is running (ollama serve) and the model is pulled (ollama pull ${model.slice(7)}).`;
    }
    if (model.startsWith('or:')) {
      return `The model failed to respond. Your OpenRouter account likely needs credits — add them at openrouter.ai/settings/credits. To use a free model, select "GPT-OSS 20B (free)" from the dropdown, or switch to a Claude model.`;
    }
    if (model.startsWith('pk:')) {
      return `Portkey request failed. Check that PORTKEY_API_KEY is set and the provider API key (Anthropic/OpenAI/Gemini) is valid.`;
    }
    return `The agent process crashed (exit code 1). Check that your API key is valid and try again.`;
  }
  return raw;
}

export async function POST(req: NextRequest) {
  let body: z.infer<typeof requestSchema>;
  try {
    const json = await req.json();
    const result = requestSchema.safeParse(json);
    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error.errors.map((e) => e.message).join(', ') }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    body = result.data;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { query, appType, model, sessionId, thinkingBudget } = body;

  const agentQuery = startAttoQuery(query, {
    model,
    appType,
    sessionId,
    thinkingBudget,
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const message of agentQuery) {
          const events = mapMessageToUIEvents(message);
          for (const event of events) {
            controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
          }
        }
      } catch (error) {
        const raw = error instanceof Error ? error.message : 'Unexpected error';
        const msg = humaniseAgentError(raw, model);
        const errEvent: UIEvent = { type: 'error', data: { message: msg } };
        controller.enqueue(encoder.encode(JSON.stringify(errEvent) + '\n'));
      } finally {
        controller.close();
      }
    },
    cancel() {
      agentQuery.interrupt?.().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
