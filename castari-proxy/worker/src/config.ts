import { McpBridgeMode, ServerToolsMode, WorkerConfig } from './types';

export interface Env {
  UPSTREAM_ANTHROPIC_BASE_URL?: string;
  UPSTREAM_OPENROUTER_BASE_URL?: string;
  UPSTREAM_GEMINI_BASE_URL?: string;
  UPSTREAM_OPENAI_BASE_URL?: string;
  SERVER_TOOLS_MODE?: string;
  MCP_BRIDGE_MODE?: string;
  OPENROUTER_DEFAULT_VENDOR?: string;
}

const DEFAULT_ANTHROPIC_URL = 'https://api.anthropic.com';
const DEFAULT_OPENROUTER_URL = 'https://openrouter.ai/api';
const DEFAULT_GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const DEFAULT_OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export function resolveConfig(env: Env): WorkerConfig {
  const anthropicBaseUrl = normalizeBaseUrl(env.UPSTREAM_ANTHROPIC_BASE_URL ?? DEFAULT_ANTHROPIC_URL, '/v1/messages');
  const openRouterBaseUrl = normalizeBaseUrl(env.UPSTREAM_OPENROUTER_BASE_URL ?? DEFAULT_OPENROUTER_URL, '/v1/chat/completions');
  const geminiBaseUrl = normalizeBaseUrl(env.UPSTREAM_GEMINI_BASE_URL ?? DEFAULT_GEMINI_URL, '/v1/chat/completions');
  const openAiBaseUrl = normalizeBaseUrl(env.UPSTREAM_OPENAI_BASE_URL ?? DEFAULT_OPENAI_URL, '/v1/chat/completions');
  const serverToolsMode = normalizeServerToolsMode(env.SERVER_TOOLS_MODE);
  const mcpMode = normalizeMcpMode(env.MCP_BRIDGE_MODE);
  const defaultOpenRouterVendor = (env.OPENROUTER_DEFAULT_VENDOR?.trim() || 'openai').toLowerCase();

  return {
    anthropicBaseUrl,
    openRouterBaseUrl,
    geminiBaseUrl,
    openAiBaseUrl,
    serverToolsMode,
    mcpMode,
    defaultOpenRouterVendor,
  };
}

function normalizeBaseUrl(value: string, suffix: '/v1/messages' | '/v1/chat/completions'): string {
  const trimmed = value.replace(/\/$/, '');
  // Accept any URL that already ends with the right endpoint path segment
  if (trimmed.endsWith('/messages') || trimmed.endsWith('/chat/completions')) return trimmed;
  return `${trimmed}${suffix}`;
}

function normalizeServerToolsMode(value?: string): ServerToolsMode {
  switch ((value ?? '').toLowerCase()) {
    case 'enforceanthropic':
    case 'enforce-anthropic':
      return 'enforceAnthropic';
    case 'emulate':
      return 'emulate';
    case 'error':
    default:
      return 'error';
  }
}

function normalizeMcpMode(value?: string): McpBridgeMode {
  switch ((value ?? '').toLowerCase()) {
    case 'http-sse':
      return 'http-sse';
    default:
      return 'off';
  }
}
