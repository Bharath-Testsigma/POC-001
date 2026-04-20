import { describe, expect, it } from 'vitest';
import { detectServerTools, resolveProvider } from '../src/provider';
import { resolveConfig } from '../src/config';

const config = resolveConfig({
  UPSTREAM_ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
  UPSTREAM_OPENROUTER_BASE_URL: 'https://openrouter.ai/api',
  SERVER_TOOLS_MODE: 'error',
  OPENROUTER_DEFAULT_VENDOR: 'openai',
});

describe('resolveProvider', () => {
  it('detects OpenRouter or: slugs and normalizes wire models', () => {
    const result = resolveProvider(
      { provider: 'openrouter', originalModel: 'or:gpt-5-mini', wireModel: undefined },
      { model: 'or:gpt-5-mini', messages: [], metadata: {}, tools: [] } as any,
      config,
    );
    expect(result.provider).toBe('openrouter');
    expect(result.wireModel).toBe('openai/gpt-5-mini');
  });

  it('infers provider when headers missing', () => {
    const result = resolveProvider(
      {},
      { model: 'claude-3-5', messages: [], metadata: {} } as any,
      config,
    );
    expect(result.provider).toBe('anthropic');
    expect(result.wireModel).toBe('claude-3-5');
  });
});

describe('detectServerTools', () => {
  it('flags Anthropic server tools based on type pattern', () => {
    const matches = detectServerTools([
      { name: 'my_tool', input_schema: {} },
      { type: 'WebSearchTool_20250305' },
    ] as any);
    expect(matches).toContain('WebSearchTool_20250305');
  });
});
