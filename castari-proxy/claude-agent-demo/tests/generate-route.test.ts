import type { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { POST } from '@/app/api/generate/route';

describe('Atto generate route', () => {
  it('rejects models outside the demo allowlist', async () => {
    const request = new Request('http://localhost:3000/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: 'Generate login test cases',
        appType: 'web',
        model: 'claude-3-opus',
      }),
    });

    const response = await POST(request as unknown as NextRequest);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      error: 'Model not allowed for demo route: claude-3-opus',
    });
  });
});
