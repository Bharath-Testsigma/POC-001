import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { POST } from '@/app/api/portkey/v1/messages/route';

const ORIGINAL_ENV = { ...process.env };

describe('Portkey route', () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      PORTKEY_API_KEY: 'pk-test',
      PORTKEY_VK_OPENAI: 'vk-openai-test',
    };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('forwards Anthropic headers and the configured virtual key upstream', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'msg_1', type: 'message', content: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = new Request('http://localhost:3000/api/portkey/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'tools-2024-04-04',
        accept: 'application/json',
      },
      body: JSON.stringify({
        model: 'pk:openai/gpt-4o',
        max_tokens: 64,
        messages: [{ role: 'user', content: 'hello' }],
        stream: false,
      }),
    });

    const response = await POST(request as unknown as NextRequest);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    const body = JSON.parse(String(init.body));

    expect(url).toBe('https://api.portkey.ai/v1/messages');
    expect(headers.get('x-portkey-api-key')).toBe('pk-test');
    expect(headers.get('x-portkey-virtual-key')).toBe('vk-openai-test');
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('anthropic-version')).toBe('2023-06-01');
    expect(headers.get('anthropic-beta')).toBe('tools-2024-04-04');
    expect(headers.get('accept')).toBe('application/json');
    expect(body.model).toBe('gpt-4o');
  });

  it('selects the matching virtual key from the requested provider model', async () => {
    process.env.PORTKEY_VK_ANTHROPIC = 'vk-anthropic-test';
    process.env.PORTKEY_VK_GOOGLE = 'vk-google-test';

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'msg_1', type: 'message', content: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const requests = [
      { model: 'claude-sonnet-4-6', expectedVirtualKey: 'vk-anthropic-test' },
      { model: 'gpt-4o', expectedVirtualKey: 'vk-openai-test' },
      { model: 'gemini-2.5-flash', expectedVirtualKey: 'vk-google-test' },
    ];

    for (const req of requests) {
      const request = new Request('http://localhost:3000/api/portkey/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: req.model,
          max_tokens: 64,
          messages: [{ role: 'user', content: 'hello' }],
          stream: false,
        }),
      });

      await POST(request as unknown as NextRequest);
    }

    const headersSeen = fetchMock.mock.calls.map(([, init]) => new Headers((init as RequestInit).headers));
    expect(headersSeen.map((headers) => headers.get('x-portkey-virtual-key'))).toEqual([
      'vk-anthropic-test',
      'vk-openai-test',
      'vk-google-test',
    ]);
  });

  it('returns a clear error when the selected provider virtual key is missing', async () => {
    delete process.env.PORTKEY_VK_OPENAI;
    const request = new Request('http://localhost:3000/api/portkey/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'pk:openai/gpt-4o',
        max_tokens: 64,
        messages: [{ role: 'user', content: 'hello' }],
        stream: false,
      }),
    });

    const response = await POST(request as unknown as NextRequest);
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({
      error: 'Virtual key not configured for provider: openai. Set PORTKEY_VK_OPENAI in .env.local',
    });
  });

  it('repairs streaming tool-use SSE when Portkey omits the tool block stop event', async () => {
    const upstreamBody = [
      'event: message_start',
      'data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[],"model":"gpt-4o","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":0,"output_tokens":0}}}',
      '',
      'event: content_block_start',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
      '',
      'event: content_block_start',
      'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"call_abc123","name":"echo_upper","input":{}}}',
      '',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"text\\":\\"hello\\"}"}}',
      '',
      'event: content_block_stop',
      'data: {"type":"content_block_stop","index":0}',
      '',
      'event: message_delta',
      'data: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":14}}',
      '',
      'event: message_stop',
      'data: {"type":"message_stop"}',
      '',
    ].join('\n');

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(upstreamBody, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = new Request('http://localhost:3000/api/portkey/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model: 'pk:openai/gpt-4o',
        max_tokens: 64,
        messages: [{ role: 'user', content: 'hello' }],
        tools: [{
          name: 'echo_upper',
          description: 'Convert text to uppercase',
          input_schema: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
          },
        }],
        stream: true,
      }),
    });

    const response = await POST(request as unknown as NextRequest);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain('"id":"toolu_abc123"');
    expect(text).toContain('event: content_block_stop\ndata: {"type":"content_block_stop","index":1}\n\nevent: message_delta');
  });

  it('rejects models outside the demo Portkey allowlist', async () => {
    const request = new Request('http://localhost:3000/api/portkey/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'gpt-5',
        max_tokens: 64,
        messages: [{ role: 'user', content: 'hello' }],
        stream: false,
      }),
    });

    const response = await POST(request as unknown as NextRequest);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      error: 'Model not allowed for Portkey demo route: gpt-5',
    });
  });
});
