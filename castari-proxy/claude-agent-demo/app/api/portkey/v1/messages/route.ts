import { NextRequest } from 'next/server';
import { isAllowedPortkeyRouteModel } from '@/lib/agent/model-allowlist';
import { enforceInternalRouteAccess } from '@/lib/security/internal-routes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PORTKEY_BASE = 'https://api.portkey.ai/v1/messages';

const VIRTUAL_KEY_ENV: Record<string, string> = {
  anthropic: 'PORTKEY_VK_ANTHROPIC',
  openai:    'PORTKEY_VK_OPENAI',
  google:    'PORTKEY_VK_GOOGLE',
};

// OpenAI output token limits (max_tokens can't exceed these)
const OPENAI_MAX_TOKENS: Record<string, number> = {
  'gpt-4.1': 32768,
  'gpt-4.1-mini': 32768,
  'gpt-4o': 16384,
  'gpt-4o-mini': 16384,
  'o4-mini': 100000,
  'o3-mini': 65536,
};

function resolveFromModel(model: string): { provider: string; wireModel: string } {
  if (model.startsWith('pk:')) {
    const slug = model.slice(3);
    const slash = slug.indexOf('/');
    const provider = slash >= 0 ? slug.slice(0, slash) : 'anthropic';
    const wireModel = slash >= 0 ? slug.slice(slash + 1) : slug;
    return { provider, wireModel };
  }
  if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')) {
    return { provider: 'openai', wireModel: model };
  }
  if (model.startsWith('gemini')) {
    return { provider: 'google', wireModel: model };
  }
  return { provider: 'anthropic', wireModel: model };
}

// Portkey passes through OpenAI function-call IDs verbatim (e.g. "call_abc123").
// The Claude CLI only recognises "toolu_*" IDs, so it silently skips tool execution
// when it sees an unrecognised prefix.  Replace every "call_" prefix with "toolu_"
// in the raw SSE/JSON text so the Claude CLI treats them as normal tool_use blocks.
function normaliseToolIds(text: string): string {
  return text.replace(/"call_([A-Za-z0-9_-]+)"/g, '"toolu_$1"');
}

function buildSyntheticStopEvent(index: number): string {
  return `event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index })}\n\n`;
}

function processSseEventBlock(block: string, openBlocks: number[]): string {
  const normalised = normaliseToolIds(block);
  if (!normalised.trim()) return `${normalised}\n\n`;

  const dataLine = normalised
    .split('\n')
    .find((line) => line.startsWith('data: '));

  if (!dataLine) return `${normalised}\n\n`;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(dataLine.slice(6)) as Record<string, unknown>;
  } catch {
    return `${normalised}\n\n`;
  }

  const type = payload.type;
  const index = typeof payload.index === 'number' ? payload.index : undefined;

  if (type === 'content_block_start' && index !== undefined && !openBlocks.includes(index)) {
    openBlocks.push(index);
  } else if (type === 'content_block_stop' && index !== undefined) {
    const pos = openBlocks.indexOf(index);
    if (pos >= 0) openBlocks.splice(pos, 1);
  } else if ((type === 'message_delta' || type === 'message_stop') && openBlocks.length > 0) {
    const syntheticStops = openBlocks
      .splice(0, openBlocks.length)
      .map((openIndex) => buildSyntheticStopEvent(openIndex))
      .join('');
    return syntheticStops + `${normalised}\n\n`;
  }

  return `${normalised}\n\n`;
}

function buildNormalisingSseBody(upstream: Response): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  const openBlocks: number[] = [];

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        controller.enqueue(encoder.encode(processSseEventBlock(block, openBlocks)));
        boundary = buffer.indexOf('\n\n');
      }
    },
    flush(controller) {
      if (buffer) {
        controller.enqueue(encoder.encode(processSseEventBlock(buffer, openBlocks)));
      } else if (openBlocks.length > 0) {
        const syntheticStops = openBlocks
          .splice(0, openBlocks.length)
          .map((openIndex) => buildSyntheticStopEvent(openIndex))
          .join('');
        controller.enqueue(encoder.encode(syntheticStops));
      }
    },
  });

  upstream.body!.pipeTo(transform.writable).catch(() => {});
  return transform.readable;
}

function buildNormalisingJsonBody(upstream: Response): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk) {
      buffer += decoder.decode(chunk, { stream: true });
    },
    flush(controller) {
      if (buffer) controller.enqueue(encoder.encode(normaliseToolIds(buffer)));
    },
  });

  upstream.body!.pipeTo(transform.writable).catch(() => {});
  return transform.readable;
}

function buildNormalisingBody(upstream: Response): ReadableStream<Uint8Array> {
  const contentType = upstream.headers.get('content-type') ?? '';
  return contentType.includes('text/event-stream')
    ? buildNormalisingSseBody(upstream)
    : buildNormalisingJsonBody(upstream);
}

function buildPortkeyHeaders(original: Headers, portkeyKey: string, virtualKey: string): Headers {
  const headers = new Headers();
  headers.set('content-type', 'application/json');
  headers.set('x-portkey-api-key', portkeyKey);
  headers.set('x-portkey-virtual-key', virtualKey);

  // Portkey's Anthropic-compatible endpoint still expects the Anthropic protocol headers
  // that the SDK sent to our local proxy route.
  const anthropicVersion = original.get('anthropic-version');
  if (anthropicVersion) headers.set('anthropic-version', anthropicVersion);

  const anthropicBeta = original.get('anthropic-beta');
  if (anthropicBeta) headers.set('anthropic-beta', anthropicBeta);

  const accept = original.get('accept');
  if (accept) headers.set('accept', accept);

  return headers;
}

export async function POST(req: NextRequest) {
  const accessDenied = enforceInternalRouteAccess(req);
  if (accessDenied) return accessDenied;

  const portkeyKey = process.env.PORTKEY_API_KEY;
  if (!portkeyKey) {
    return new Response(JSON.stringify({ error: 'PORTKEY_API_KEY not configured' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const requestedModel = typeof body.model === 'string' ? body.model : '';
  if (!requestedModel || !isAllowedPortkeyRouteModel(requestedModel)) {
    return new Response(JSON.stringify({ error: `Model not allowed for Portkey demo route: ${requestedModel || '<missing>'}` }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const { provider, wireModel } = resolveFromModel(requestedModel);
  body.model = wireModel;

  if (provider === 'openai' && typeof body.max_tokens === 'number') {
    const cap = OPENAI_MAX_TOKENS[wireModel] ?? 16384;
    if (body.max_tokens > cap) body.max_tokens = cap;
  }

  const vkEnvKey = VIRTUAL_KEY_ENV[provider] ?? VIRTUAL_KEY_ENV.anthropic;
  const virtualKey = process.env[vkEnvKey];

  if (!virtualKey) {
    return new Response(JSON.stringify({ error: `Virtual key not configured for provider: ${provider}. Set ${vkEnvKey} in .env.local` }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  let upstream: Response;
  try {
    upstream = await fetch(PORTKEY_BASE, {
      method: 'POST',
      headers: buildPortkeyHeaders(req.headers, portkeyKey, virtualKey),
      body: JSON.stringify(body),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return new Response(JSON.stringify({ error: `Failed to reach Portkey: ${message}` }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }

  const responseBody = upstream.body ? buildNormalisingBody(upstream) : null;

  return new Response(responseBody, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    },
  });
}
