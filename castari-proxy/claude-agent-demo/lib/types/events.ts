import type { NonNullableUsage } from '@anthropic-ai/claude-agent-sdk';

export type SystemEvent = {
  type: 'system';
  data: {
    session_id: string;
    model: string;
    tools: string[];
    cwd: string;
  };
};

export type AssistantEvent = {
  type: 'assistant';
  data: {
    text: string;
    stop_reason?: string | null;
  };
};

export type PartialEvent = {
  type: 'partial';
  data: {
    textDelta: string;
  };
};

export type ToolEvent = {
  type: 'tool';
  data: {
    toolUseId: string;
    name: string;
    status: 'call' | 'progress' | 'result';
    input?: unknown;
    output?: unknown;
    elapsedTimeSeconds?: number;
    parentToolUseId?: string | null;
    isError?: boolean;
    message?: string;
  };
};

export type ThinkingEvent = {
  type: 'thinking';
  data: {
    blockId: string;
    status: 'start' | 'delta' | 'complete';
    text?: string;
    redacted?: boolean;
  };
};

export type ResultEvent = {
  type: 'result';
  data: {
    usage: NonNullableUsage;
    total_cost_usd?: number;
    duration_ms?: number;
    num_turns?: number;
    stop_reason?: string | null;
  };
};

export type CompactBoundaryEvent = {
  type: 'compact_boundary';
  data: {
    trigger: 'manual' | 'auto';
    pre_tokens: number;
  };
};

export type ErrorEvent = {
  type: 'error';
  data: {
    message: string;
  };
};

export type UIEvent =
  | SystemEvent
  | AssistantEvent
  | PartialEvent
  | ToolEvent
  | ResultEvent
  | CompactBoundaryEvent
  | ErrorEvent
  | ThinkingEvent;
