import { describe, expect, it } from 'vitest';
import { buildOptions } from '@/lib/agent/session';

describe('buildOptions', () => {
  it('defaults to the haiku model when CLAUDE_MODEL is unset', () => {
    const options = buildOptions();
    expect(options.model).toBe('claude-haiku-4-5-20251001');
  });

  it('sets resume when a session id is provided', () => {
    const sessionId = 'session-123';
    const options = buildOptions({ sessionId });
    expect(options.resume).toBe(sessionId);
  });

  it('enables maxThinkingTokens when thinking is configured', () => {
    const options = buildOptions({
      thinking: { enabled: true, budgetTokens: 9000 }
    });
    expect(options.maxThinkingTokens).toBe(9000);
  });
});
