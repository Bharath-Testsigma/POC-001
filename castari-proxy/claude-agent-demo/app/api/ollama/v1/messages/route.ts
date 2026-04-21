import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OLLAMA_BASE = process.env.OLLAMA_HOST ?? 'http://localhost:11434';

/* ------------------------------------------------------------------ types */

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string | ContentBlock[] }
  | { type: 'thinking'; thinking: string }
  | { type: 'redacted_thinking'; data: string };

type AnthropicMessage = { role: 'user' | 'assistant'; content: string | ContentBlock[] };
type AnthropicTool = { name: string; description?: string; input_schema: Record<string, unknown> };
type AnthropicRequest = {
  model: string;
  messages: AnthropicMessage[];
  system?: string | { type: string; text: string; [k: string]: unknown }[];
  max_tokens?: number;
  stream?: boolean;
  tools?: AnthropicTool[];
};

type OllamaToolCall = {
  id?: string;
  function: { name: string; arguments: Record<string, unknown> | string };
};
type OllamaMessage = {
  role: string;
  content: string | null;
  tool_calls?: OllamaToolCall[];
  tool_call_id?: string;
};
type OllamaResponse = {
  message: { role: string; content?: string | null; tool_calls?: OllamaToolCall[] };
  done_reason?: string;
};

/* ------------------------------------------------------------------ request translation */

function systemText(system: AnthropicRequest['system']): string {
  if (!system) return '';
  if (typeof system === 'string') return system;
  return system.filter(b => b.type === 'text').map(b => b.text).join('\n');
}

function blockText(blocks: ContentBlock[]): string {
  return blocks
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('\n');
}

function toOllamaMessages(messages: AnthropicMessage[], system: AnthropicRequest['system']): OllamaMessage[] {
  const result: OllamaMessage[] = [];
  const sys = systemText(system);
  if (sys) result.push({ role: 'system', content: sys });

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      result.push({ role: msg.role, content: msg.content });
      continue;
    }

    const blocks = msg.content as ContentBlock[];

    // User message with tool_results → one tool role message per result
    if (msg.role === 'user' && blocks.some(b => b.type === 'tool_result')) {
      for (const block of blocks) {
        if (block.type === 'tool_result') {
          const content =
            typeof block.content === 'string'
              ? block.content
              : Array.isArray(block.content)
              ? blockText(block.content as ContentBlock[])
              : '';
          result.push({ role: 'tool', content });
        } else if (block.type === 'text') {
          const text = (block as { type: 'text'; text: string }).text;
          if (text) result.push({ role: msg.role, content: text });
        }
      }
      continue;
    }

    // Assistant message with tool_use → tool_calls
    if (msg.role === 'assistant') {
      const toolUse = blocks.filter(b => b.type === 'tool_use') as Array<{
        type: 'tool_use'; id: string; name: string; input: Record<string, unknown>;
      }>;
      if (toolUse.length) {
        result.push({
          role: 'assistant',
          content: blockText(blocks) || null,
          tool_calls: toolUse.map(b => ({
            function: { name: b.name, arguments: b.input },
          })),
        });
        continue;
      }
    }

    result.push({ role: msg.role, content: blockText(blocks) });
  }

  return result;
}

function toOllamaTools(tools?: AnthropicTool[]) {
  if (!tools?.length) return undefined;
  return tools.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description ?? '', parameters: t.input_schema },
  }));
}

/* ------------------------------------------------------------------ response translation */

function sse(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function argsString(args: Record<string, unknown> | string): string {
  return typeof args === 'string' ? args : JSON.stringify(args);
}

function buildAnthropicStream(ollamaResp: OllamaResponse, originalModel: string): ReadableStream<Uint8Array> {
  const msgId = `msg_oll_${Date.now()}`;
  const { message } = ollamaResp;
  const textContent = message.content ?? '';
  const rawToolCalls = message.tool_calls ?? [];

  // Generate stable IDs for tool calls (used by the agent to match results)
  const ts = Date.now();
  const toolCalls = rawToolCalls.map((tc, i) => ({
    id: `toolu_${ts}_${i}`,
    name: tc.function.name,
    argsStr: argsString(tc.function.arguments),
  }));

  return new ReadableStream({
    start(controller) {
      controller.enqueue(sse('message_start', {
        type: 'message_start',
        message: {
          id: msgId, type: 'message', role: 'assistant', model: originalModel,
          content: [], stop_reason: null, usage: { input_tokens: 0, output_tokens: 0 },
        },
      }));

      // Text block (always emitted even if empty, to satisfy SDK state machine)
      controller.enqueue(sse('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }));
      if (textContent) {
        controller.enqueue(sse('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: textContent } }));
      }
      controller.enqueue(sse('content_block_stop', { type: 'content_block_stop', index: 0 }));

      // Tool use blocks
      for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i];
        const idx = i + 1;
        controller.enqueue(sse('content_block_start', { type: 'content_block_start', index: idx, content_block: { type: 'tool_use', id: tc.id, name: tc.name, input: {} } }));
        controller.enqueue(sse('content_block_delta', { type: 'content_block_delta', index: idx, delta: { type: 'input_json_delta', partial_json: tc.argsStr } }));
        controller.enqueue(sse('content_block_stop', { type: 'content_block_stop', index: idx }));
      }

      const stopReason = toolCalls.length ? 'tool_use' : (ollamaResp.done_reason === 'length' ? 'max_tokens' : 'end_turn');
      controller.enqueue(sse('message_delta', { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 0 } }));
      controller.enqueue(sse('message_stop', { type: 'message_stop' }));
      controller.close();
    },
  });
}

/* ------------------------------------------------------------------ handler */

export async function POST(req: NextRequest) {
  let body: AnthropicRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const ollamaModel = body.model.startsWith('ollama:') ? body.model.slice(7) : body.model;

  const ollamaPayload: Record<string, unknown> = {
    model: ollamaModel,
    messages: toOllamaMessages(body.messages, body.system),
    stream: false, // always non-streaming; we emit SSE ourselves for reliability
    options: { ...(body.max_tokens ? { num_predict: body.max_tokens } : {}) },
  };

  const ollamaTools = toOllamaTools(body.tools);
  if (ollamaTools?.length) ollamaPayload.tools = ollamaTools;

  let ollamaResp: Response;
  try {
    ollamaResp = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(ollamaPayload),
    });
  } catch {
    return Response.json(
      { error: `Cannot reach Ollama at ${OLLAMA_BASE}. Run: ollama serve` },
      { status: 503 },
    );
  }

  if (!ollamaResp.ok) {
    const text = await ollamaResp.text().catch(() => 'unknown');
    return Response.json({ error: `Ollama error (${ollamaResp.status}): ${text}` }, { status: ollamaResp.status });
  }

  const data = await ollamaResp.json() as OllamaResponse;

  if (body.stream) {
    const stream = buildAnthropicStream(data, body.model);
    return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' } });
  }

  // Non-streaming Anthropic response
  const textContent = data.message.content ?? '';
  const rawToolCalls = data.message.tool_calls ?? [];
  const ts = Date.now();
  const content: unknown[] = [];

  if (textContent) content.push({ type: 'text', text: textContent });
  rawToolCalls.forEach((tc, i) => {
    let input: unknown = {};
    try { input = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments; } catch {}
    content.push({ type: 'tool_use', id: `toolu_${ts}_${i}`, name: tc.function.name, input });
  });

  return Response.json({
    id: `msg_oll_${ts}`,
    type: 'message',
    role: 'assistant',
    model: body.model,
    content,
    stop_reason: rawToolCalls.length ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  });
}
