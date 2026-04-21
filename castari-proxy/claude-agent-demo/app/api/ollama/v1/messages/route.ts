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
  system?: string | { type: string; text: string }[];
  max_tokens?: number;
  stream?: boolean;
  tools?: AnthropicTool[];
};

type OllamaMessage = {
  role: string;
  content: string | null;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
};

/* ------------------------------------------------------------------ translators */

function systemText(system: AnthropicRequest['system']): string {
  if (!system) return '';
  if (typeof system === 'string') return system;
  return system.filter(b => b.type === 'text').map(b => b.text).join('\n');
}

function blockText(blocks: ContentBlock[]): string {
  return blocks.filter(b => b.type === 'text').map(b => (b as { type: 'text'; text: string }).text).join('\n');
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

    // User message with tool_results → one "tool" role message per result
    if (msg.role === 'user' && blocks.some(b => b.type === 'tool_result')) {
      for (const block of blocks) {
        if (block.type === 'tool_result') {
          const content = typeof block.content === 'string'
            ? block.content
            : Array.isArray(block.content) ? blockText(block.content as ContentBlock[]) : '';
          result.push({ role: 'tool', tool_call_id: block.tool_use_id, content });
        } else if (block.type === 'text' && (block as { type: 'text'; text: string }).text) {
          result.push({ role: msg.role, content: (block as { type: 'text'; text: string }).text });
        }
      }
      continue;
    }

    // Assistant message with tool_use → tool_calls
    if (msg.role === 'assistant') {
      const toolUseBlocks = blocks.filter(b => b.type === 'tool_use') as Array<{ type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }>;
      if (toolUseBlocks.length) {
        const text = blockText(blocks) || null;
        result.push({
          role: 'assistant',
          content: text,
          tool_calls: toolUseBlocks.map(b => ({
            id: b.id,
            type: 'function' as const,
            function: { name: b.name, arguments: JSON.stringify(b.input) },
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

/* ------------------------------------------------------------------ streaming */

function sse(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function streamOllamaToAnthropic(
  ollamaBody: ReadableStream<Uint8Array>,
  originalModel: string,
): Promise<ReadableStream<Uint8Array>> {
  const msgId = `msg_oll_${Date.now()}`;
  const decoder = new TextDecoder();

  return new ReadableStream({
    async start(controller) {
      controller.enqueue(sse('message_start', {
        type: 'message_start',
        message: { id: msgId, type: 'message', role: 'assistant', model: originalModel, content: [], stop_reason: null, usage: { input_tokens: 0, output_tokens: 0 } },
      }));
      controller.enqueue(sse('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }));
      controller.enqueue(sse('ping', { type: 'ping' }));

      let buffer = '';
      let outputTokens = 0;
      // Collect tool calls; Ollama streams them in the final done=true chunk
      let toolCalls: Array<{ id: string; name: string; args: string }> = [];

      const reader = ollamaBody.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            let chunk: Record<string, unknown>;
            try { chunk = JSON.parse(trimmed); } catch { continue; }

            const msg = chunk.message as Record<string, unknown> | undefined;

            // Tool calls arrive in the done chunk
            if (Array.isArray(msg?.tool_calls) && (msg.tool_calls as unknown[]).length) {
              toolCalls = (msg.tool_calls as Array<{ id: string; type: string; function: { name: string; arguments: string } }>).map(tc => ({
                id: tc.id,
                name: tc.function.name,
                args: tc.function.arguments,
              }));
            }

            // Streamed text delta
            if (typeof msg?.content === 'string' && msg.content) {
              outputTokens++;
              controller.enqueue(sse('content_block_delta', {
                type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: msg.content },
              }));
            }

            if (chunk.done) {
              controller.enqueue(sse('content_block_stop', { type: 'content_block_stop', index: 0 }));

              // Emit tool_use blocks after the text block
              for (let i = 0; i < toolCalls.length; i++) {
                const tc = toolCalls[i];
                const idx = i + 1;
                controller.enqueue(sse('content_block_start', { type: 'content_block_start', index: idx, content_block: { type: 'tool_use', id: tc.id, name: tc.name, input: {} } }));
                controller.enqueue(sse('content_block_delta', { type: 'content_block_delta', index: idx, delta: { type: 'input_json_delta', partial_json: tc.args } }));
                controller.enqueue(sse('content_block_stop', { type: 'content_block_stop', index: idx }));
              }

              const stopReason = toolCalls.length ? 'tool_use' : (chunk.done_reason === 'length' ? 'max_tokens' : 'end_turn');
              controller.enqueue(sse('message_delta', { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: outputTokens } }));
              controller.enqueue(sse('message_stop', { type: 'message_stop' }));
            }
          }
        }
      } finally {
        reader.releaseLock();
        controller.close();
      }
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
    stream: body.stream ?? false,
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

  // Streaming response
  if (body.stream) {
    if (!ollamaResp.body) return Response.json({ error: 'No response body from Ollama' }, { status: 502 });
    const stream = await streamOllamaToAnthropic(ollamaResp.body, body.model);
    return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' } });
  }

  // Non-streaming response
  const data = await ollamaResp.json() as { message: { role: string; content?: string; tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }> }; done_reason?: string };
  const content: unknown[] = [];

  if (data.message.tool_calls?.length) {
    for (const tc of data.message.tool_calls) {
      let input: unknown = {};
      try { input = JSON.parse(tc.function.arguments); } catch {}
      content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
    }
  }
  if (data.message.content) content.push({ type: 'text', text: data.message.content });

  return Response.json({
    id: `msg_oll_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    model: body.model,
    content,
    stop_reason: data.message.tool_calls?.length ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  });
}
