import path from 'node:path';
import { type Options } from '@anthropic-ai/claude-agent-sdk';
import { env, PROJECT_CWD } from '@/lib/env';
import { buildMcpServers } from '@/lib/mcp/servers';
import { buildPolicy, ATTO_WORKSPACE } from '@/lib/policy/permission';
import { queryCastari, type CastariOptions } from '@/lib/castariProxy';

export { ATTO_WORKSPACE };

function buildAttoSystemPrompt(appType: string): string {
  const workspacePath = path.relative(PROJECT_CWD, ATTO_WORKSPACE);

  return `You are Atto, an AI-powered test case generator for ${appType} applications.

## Your Workspace
Write all test case files to: ${workspacePath}/
Example: Write(file_path="${workspacePath}/login_success.xml", content="...")

## Tools Available
- Read(file_path): Read an existing file
- Write(file_path, content): Write a new file (always use ${workspacePath}/ prefix)
- Glob(pattern, path): List files (use pattern "${workspacePath}/*.xml")

## Rules
1. Generate ONE test case per XML file with a descriptive name (e.g. login_happy_path.xml)
2. ALL file paths must start with "${workspacePath}/"
3. Every file MUST be valid XML in the format below
4. For EDIT requests: Read the file first, then Write the updated version
5. For QUESTION requests: Answer directly, write no files

## XML Format (required)
<?xml version="1.0" encoding="UTF-8"?>
<test-case>
  <title>Descriptive test case title</title>
  <steps>
    <step order="1">
      <action>Navigate to URL</action>
      <target>https://example.com/login</target>
      <value></value>
    </step>
    <step order="2">
      <action>Enter text</action>
      <target>Email input field</target>
      <value>user@example.com</value>
    </step>
    <step order="3">
      <action>Click</action>
      <target>Submit button</target>
      <value></value>
    </step>
    <step order="4">
      <action>Verify text</action>
      <target>Page heading</target>
      <value>Dashboard</value>
    </step>
  </steps>
</test-case>

## Final Response
After completing all file operations, always end with:
<output>
workflow_type: GENERATION
summary: Brief description of what was generated.
</output>

workflow_type must be one of:
- GENERATION — new test cases created
- EDIT — existing test cases modified
- QUESTION — user asked a question, no files written`;
}

export type AttoQueryConfig = {
  model: string;
  appType: string;
  sessionId?: string;
  thinkingBudget?: number;
};

export function buildAttoOptions(config: AttoQueryConfig): CastariOptions {
  const policy = buildPolicy('atto');
  const mcpServers = buildMcpServers();

  const isOllama = config.model.startsWith('ollama:');
  const baseUrl = isOllama
    ? `${process.env.NEXT_SERVER_URL ?? 'http://localhost:3000'}/api/ollama`
    : env.CASTARI_WORKER_URL;

  const envOverrides: Record<string, string> = {
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
    ANTHROPIC_BASE_URL: baseUrl,
    CASTARI_GATEWAY_URL: baseUrl,
  };

  if (env.OPENROUTER_API_KEY) envOverrides.OPENROUTER_API_KEY = env.OPENROUTER_API_KEY;
  if ((env as Record<string, string | undefined>).GEMINI_API_KEY) {
    envOverrides.GEMINI_API_KEY = (env as Record<string, string | undefined>).GEMINI_API_KEY!;
  }
  if ((env as Record<string, string | undefined>).OPENAI_API_KEY) {
    envOverrides.OPENAI_API_KEY = (env as Record<string, string | undefined>).OPENAI_API_KEY!;
  }
  if (env.CASTARI_WORKER_TOKEN) envOverrides.X_WORKER_TOKEN = env.CASTARI_WORKER_TOKEN;

  const options: Options = {
    cwd: PROJECT_CWD,
    executable: 'node',
    executableArgs: [],
    env: envOverrides,
    model: config.model,
    permissionMode: 'acceptEdits',
    includePartialMessages: true,
    allowedTools: policy.allowedTools,
    disallowedTools: policy.disallowedTools,
    canUseTool: policy.canUseTool,
    mcpServers,
    settingSources: [],
    systemPrompt: buildAttoSystemPrompt(config.appType),
    hooks: policy.hooks,
    resume: config.sessionId,
  };

  const supportsThinking = config.model.startsWith('claude');
  if (supportsThinking && config.thinkingBudget && config.thinkingBudget > 0) {
    options.maxThinkingTokens = config.thinkingBudget;
  }

  return options as CastariOptions;
}

export function startAttoQuery(prompt: string, config: AttoQueryConfig) {
  return queryCastari({
    prompt,
    options: buildAttoOptions(config),
  });
}
