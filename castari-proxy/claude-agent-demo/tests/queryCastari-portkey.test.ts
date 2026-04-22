import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdkQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: sdkQueryMock,
}));

describe('queryCastari portkey mode', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.PORTKEY_API_KEY = 'pk-live';
    process.env.OPENAI_API_KEY = 'sk-openai-live';
    process.env.GEMINI_API_KEY = 'gm-live';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-live';
  });

  it('strips raw provider keys from the SDK env for pk models', async () => {
    sdkQueryMock.mockReturnValue({ kind: 'query' });
    const { queryCastari } = await import('../../src/queryCastari');

    queryCastari({
      prompt: 'hello',
      options: {
        model: 'pk:openai/gpt-4o',
        env: {
          ANTHROPIC_BASE_URL: 'http://localhost:3000/api/portkey',
          CASTARI_GATEWAY_URL: 'http://localhost:3000/api/portkey',
        },
      },
    });

    expect(sdkQueryMock).toHaveBeenCalledTimes(1);
    const call = sdkQueryMock.mock.calls[0]?.[0] as {
      options: { env: Record<string, string | undefined> };
    };

    expect(call.options.env.ANTHROPIC_API_KEY).toBe('pk-live');
    expect(call.options.env.OPENAI_API_KEY).toBeUndefined();
    expect(call.options.env.GEMINI_API_KEY).toBeUndefined();
  });
});
