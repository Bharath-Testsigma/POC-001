import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PORTKEY_BASE = 'https://api.portkey.ai/v1/messages';

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

function getProviderApiKey(provider: string): string | undefined {
  if (provider === 'openai') return process.env.OPENAI_API_KEY;
  if (provider === 'google') return process.env.GEMINI_API_KEY;
  return process.env.ANTHROPIC_API_KEY;
}

export async function POST(req: NextRequest) {
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

  const { provider, wireModel } = resolveFromModel((body.model as string) ?? '');
  const providerKey = getProviderApiKey(provider);
  body.model = wireModel;

  const upstream = await fetch(PORTKEY_BASE, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-portkey-api-key': portkeyKey,
      'x-portkey-provider': provider,
      ...(providerKey ? { authorization: `Bearer ${providerKey}` } : {}),
    },
    body: JSON.stringify(body),
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    },
  });
}
