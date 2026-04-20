import { type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { env, PROJECT_CWD } from '@/lib/env';
import { buildMcpServers } from '@/lib/mcp/servers';
import { buildPolicy, type ToolMode } from '@/lib/policy/permission';
import { queryCastari, type CastariOptions } from '@/lib/castariProxy';

export type QueryRuntimeConfig = {
  mode?: ToolMode;
  model?: string;
  useProjectInstructions?: boolean;
  sessionId?: string;
  thinking?: {
    enabled: boolean;
    budgetTokens: number;
  };
};

export type QueryPrompt = string | AsyncIterable<SDKMessage>;

export function buildOptions(config: QueryRuntimeConfig = {}): CastariOptions {
  const policy = buildPolicy(config.mode ?? 'safe');
  const mcpServers = buildMcpServers();
  const envOverrides: Record<string, string> = {
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
    ANTHROPIC_BASE_URL: env.CASTARI_WORKER_URL,
    CASTARI_GATEWAY_URL: env.CASTARI_WORKER_URL
  };

  if (env.OPENROUTER_API_KEY) envOverrides.OPENROUTER_API_KEY = env.OPENROUTER_API_KEY;
  if (env.CASTARI_WORKER_TOKEN) envOverrides.X_WORKER_TOKEN = env.CASTARI_WORKER_TOKEN;
  if (env.CASTARI_SUBAGENT_MODEL) envOverrides.CASTARI_SUBAGENT_MODEL = env.CASTARI_SUBAGENT_MODEL;

  const options: Options = {
    cwd: PROJECT_CWD,
    executable: 'node',
    executableArgs: [],
    env: envOverrides,
    model: config.model ?? env.CLAUDE_MODEL ?? 'claude-sonnet-4-5-20250929',
    permissionMode: env.AGENT_PERMISSION_MODE ?? 'default',
    includePartialMessages: env.AGENT_ENABLE_PARTIALS === 'true',
    allowedTools: policy.allowedTools,
    disallowedTools: policy.disallowedTools,
    canUseTool: policy.canUseTool,
    mcpServers,
    settingSources: config.useProjectInstructions ? ['project'] : [],
    systemPrompt: config.useProjectInstructions
      ? { type: 'preset', preset: 'claude_code' }
      : undefined,
    hooks: policy.hooks,
    resume: config.sessionId
  };

  if (config.thinking?.enabled) {
    options.maxThinkingTokens = config.thinking.budgetTokens;
  }

  return options as CastariOptions;
}

export function startQuery(prompt: QueryPrompt, config: QueryRuntimeConfig = {}) {
  return queryCastari({
    prompt,
    options: buildOptions(config)
  });
}
