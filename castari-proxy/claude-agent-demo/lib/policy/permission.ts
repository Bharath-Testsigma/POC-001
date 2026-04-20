import path from 'node:path';
import type { CanUseTool, HookCallbackMatcher, HookEvent } from '@anthropic-ai/claude-agent-sdk';
import type { ToolInputSchemas as ToolInput } from '@anthropic-ai/claude-agent-sdk/sdk-tools';
import { createTranscriptHooks } from '@/lib/agent/hooks';
import { PROJECT_CWD } from '@/lib/env';
import { ensureDir, ensureInside } from './paths';

export type ToolMode = 'safe' | 'full' | 'atto';

const SAFE_TOOLS = Object.freeze([
  'Read',
  'Glob',
  'Grep',
  'TodoWrite',
  'ListMcpResources',
  'ReadMcpResource'
]);

const FULL_MODE_EXTRAS = Object.freeze([
  'Write',
  'Edit',
  'NotebookEdit',
  'WebFetch',
  'WebSearch'
]);

const ATTO_TOOLS = Object.freeze(['Read', 'Write', 'Glob', 'Grep', 'TodoWrite']);

const ALWAYS_DENIED = Object.freeze(['Bash', 'KillBash']);

const WRITE_ROOT = path.join(PROJECT_CWD, '.data', 'out');
ensureDir(WRITE_ROOT);

export const ATTO_WORKSPACE = path.join(PROJECT_CWD, '.data', 'workspace');
ensureDir(ATTO_WORKSPACE);

type HooksMap = Partial<Record<HookEvent, HookCallbackMatcher[]>>;

export interface PolicyConfig {
  allowedTools: string[];
  disallowedTools: string[];
  canUseTool: CanUseTool;
  hooks: HooksMap;
}

export function buildPolicy(mode: ToolMode): PolicyConfig {
  const allowedTools =
    mode === 'atto'
      ? [...ATTO_TOOLS]
      : mode === 'full'
        ? Array.from(new Set([...SAFE_TOOLS, ...FULL_MODE_EXTRAS]))
        : [...SAFE_TOOLS];

  const writeRoot = mode === 'atto' ? ATTO_WORKSPACE : WRITE_ROOT;
  const disallowedTools = [...ALWAYS_DENIED];

  const canUseTool: CanUseTool = async (toolName, input) => {
    if (!allowedTools.includes(toolName) || disallowedTools.includes(toolName)) {
      return {
        behavior: 'deny',
        message: `Tool not allowed: ${toolName}`,
        interrupt: false
      };
    }

    try {
      const updatedInput = rewriteInputs(toolName, input as ToolInput, writeRoot);
      return { behavior: 'allow', updatedInput };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Tool policy violation';
      return { behavior: 'deny', message, interrupt: false };
    }
  };

  return {
    allowedTools,
    disallowedTools,
    canUseTool,
    hooks: createTranscriptHooks()
  };
}

function rewriteInputs(toolName: string, input: ToolInput, writeRoot: string): Record<string, unknown> {
  switch (toolName) {
    case 'Read':
      return rewriteReadInput(input);
    case 'Edit':
      return rewriteEditInput(input);
    case 'Write':
      return rewriteWriteInput(input, writeRoot);
    case 'Glob':
    case 'Grep':
      return rewriteSearchInput(input);
    default:
      return input as Record<string, unknown>;
  }
}

function rewriteReadInput(input: ToolInput): Record<string, unknown> {
  const fileInput = input as { file_path: string };
  if (!fileInput.file_path) throw new Error('file_path is required');
  return {
    ...fileInput,
    file_path: ensureInside(PROJECT_CWD, fileInput.file_path)
  };
}

function rewriteEditInput(input: ToolInput): Record<string, unknown> {
  const fileInput = input as { file_path: string };
  if (!fileInput.file_path) throw new Error('file_path is required');
  return {
    ...fileInput,
    file_path: ensureInside(PROJECT_CWD, fileInput.file_path)
  };
}

function rewriteWriteInput(input: ToolInput, writeRoot: string): Record<string, unknown> {
  const writeInput = input as { file_path: string; content: string };
  if (!writeInput.file_path) throw new Error('file_path is required');
  const target = ensureInside(writeRoot, writeInput.file_path);
  ensureDir(path.dirname(target));
  return {
    ...writeInput,
    file_path: target
  };
}

function rewriteSearchInput(input: ToolInput): Record<string, unknown> {
  const searchInput = input as { path?: string };
  if (!searchInput.path) {
    return input as Record<string, unknown>;
  }

  return {
    ...searchInput,
    path: ensureInside(PROJECT_CWD, searchInput.path)
  } as Record<string, unknown>;
}
