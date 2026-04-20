import { CastariHeaders } from './types';
import { invalidRequest } from './errors';

export function getHeader(headers: Headers, name: string): string | null {
  for (const [key, value] of headers.entries()) {
    if (key.toLowerCase() === name.toLowerCase()) return value;
  }
  return null;
}

export async function readJsonBody<T>(request: Request): Promise<T> {
  try {
    const text = await request.text();
    if (!text) throw invalidRequest('Request body is empty');
    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw invalidRequest('Request body is not valid JSON');
    }
    throw error;
  }
}

export function normalizeCastariHeaders(headers: Headers): CastariHeaders {
  return {
    provider: getHeader(headers, 'x-castari-provider') as CastariHeaders['provider'],
    originalModel: getHeader(headers, 'x-castari-model') ?? undefined,
    wireModel: getHeader(headers, 'x-castari-wire-model') ?? undefined,
  };
}

export function cloneRequestWithBody(request: Request, body: BodyInit | null, headers: HeadersInit): Request {
  const init: RequestInit = {
    method: request.method,
    headers,
    body,
    redirect: request.redirect,
  };
  return new Request(request.url, init);
}

export function makeUpstreamHeaders(original: Headers, additions: Record<string, string | undefined>): Headers {
  const headers = new Headers();
  for (const [key, value] of original.entries()) {
    if (key.toLowerCase() === 'host') continue;
    if (key.toLowerCase() === 'content-length') continue;
  }
  for (const [key, value] of Object.entries(additions)) {
    if (value) headers.set(key, value);
  }
  return headers;
}

export function isJsonMime(value: string | null): boolean {
  return !!value && value.toLowerCase().includes('application/json');
}

export function randomId(prefix: string): string {
  const base = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}_${base.replace(/-/g, '')}`;
}
