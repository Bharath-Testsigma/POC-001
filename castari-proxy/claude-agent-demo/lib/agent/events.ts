import { randomUUID } from 'node:crypto';
import type {
  SDKAssistantMessage,
  SDKCompactBoundaryMessage,
  SDKMessage,
  SDKPartialAssistantMessage,
  SDKResultMessage,
  SDKSystemMessage,
  SDKToolProgressMessage
} from '@anthropic-ai/claude-agent-sdk';
import type { UIEvent } from '@/lib/types/events';

export function mapMessageToUIEvents(message: SDKMessage): UIEvent[] {
  const events: UIEvent[] = [];

  switch (message.type) {
    case 'system': {
      if ((message as SDKSystemMessage).subtype === 'init') {
        const init = message as SDKSystemMessage;
        events.push({
          type: 'system',
          data: {
            session_id: init.session_id,
            model: init.model,
            tools: init.tools,
            cwd: init.cwd
          }
        });
      } else if ((message as SDKCompactBoundaryMessage).subtype === 'compact_boundary') {
        const compact = message as SDKCompactBoundaryMessage;
        events.push({
          type: 'compact_boundary',
          data: {
            trigger: compact.compact_metadata.trigger,
            pre_tokens: compact.compact_metadata.pre_tokens
          }
        });
      }
      break;
    }
    case 'assistant': {
      appendAssistantEvents(message as SDKAssistantMessage, events);
      break;
    }
    case 'stream_event': {
      appendStreamEvents(message as SDKPartialAssistantMessage, events);
      break;
    }
    case 'result': {
      const result = message as SDKResultMessage;
      if (result.subtype === 'success') {
        events.push({
          type: 'result',
          data: {
            usage: result.usage,
            total_cost_usd: result.total_cost_usd,
            duration_ms: result.duration_ms,
            num_turns: result.num_turns,
            stop_reason: result.result ?? null
          }
        });
      } else {
        events.push({
          type: 'error',
          data: { message: result.subtype }
        });
      }
      break;
    }
    case 'tool_progress': {
      const progress = message as SDKToolProgressMessage;
      events.push({
        type: 'tool',
        data: {
          toolUseId: progress.tool_use_id,
          name: progress.tool_name,
          status: 'progress',
          elapsedTimeSeconds: progress.elapsed_time_seconds,
          parentToolUseId: progress.parent_tool_use_id
        }
      });
      break;
    }
    default:
      break;
  }

  return events;
}

function appendAssistantEvents(message: SDKAssistantMessage, events: UIEvent[]) {
  const rawContent = message.message.content as unknown;
  const segments: AssistantContentSegment[] = Array.isArray(rawContent)
    ? (rawContent as AssistantContentSegment[])
    : [];
  const textParts: string[] = [];

  for (const segment of segments) {
    if (segment?.type === 'text') {
      textParts.push(segment.text ?? '');
      continue;
    }

    if (segment?.type === 'thinking') {
      events.push(
        createThinkingEvent({
          blockId: segment.id ?? message.uuid ?? message.session_id ?? 'thinking',
          status: 'complete',
          text: segment.thinking ?? '',
          redacted: false
        })
      );
      continue;
    }

    if (segment?.type === 'redacted_thinking') {
      events.push(
        createThinkingEvent({
          blockId: segment.id ?? message.uuid ?? message.session_id ?? 'thinking',
          status: 'complete',
          text: '',
          redacted: true
        })
      );
      continue;
    }

    if (segment?.type === 'tool_use') {
      events.push(createToolCallEvent(segment));
      continue;
    }

    if (segment?.type === 'tool_result') {
      events.push(createToolResultEvent(segment));
    }
  }

  const text = textParts.join('').trim();
  if (text) {
    events.push({
      type: 'assistant',
      data: {
        text,
        stop_reason: extractStopReason(message)
      }
    });
  }
}

function appendStreamEvents(message: SDKPartialAssistantMessage, events: UIEvent[]) {
  const eventPayload = message.event as Record<string, unknown>;
  const eventType = eventPayload?.type;
  if (eventType !== 'content_block_delta') {
    const textDelta = extractTextDelta(message);
    if (textDelta) {
      events.push({
        type: 'partial',
        data: { textDelta }
      });
    }
    return;
  }

  const delta = eventPayload.delta as Record<string, unknown> | undefined;
  const blockId = deriveBlockId(message, eventPayload);

  if (delta?.type === 'thinking_delta') {
    const thinkingText = typeof delta.thinking === 'string' ? delta.thinking : '';
    if (thinkingText) {
      events.push(
        createThinkingEvent({
          blockId,
          status: 'delta',
          text: thinkingText,
          redacted: false
        })
      );
    }
    return;
  }

  if (delta?.type === 'text_delta') {
    const text = typeof delta.text === 'string' ? delta.text : '';
    if (text) {
      events.push({
        type: 'partial',
        data: { textDelta: text }
      });
    }
    return;
  }

  // fall back to text extraction for other delta types
  const fallback = extractTextDelta(message);
  if (fallback) {
    events.push({
      type: 'partial',
      data: { textDelta: fallback }
    });
  }
}

function createThinkingEvent({
  blockId,
  status,
  text,
  redacted
}: {
  blockId: string;
  status: 'start' | 'delta' | 'complete';
  text?: string;
  redacted?: boolean;
}): UIEvent {
  return {
    type: 'thinking',
    data: {
      blockId,
      status,
      text,
      redacted
    }
  };
}

function createToolCallEvent(segment: ToolUseSegment) {
  return {
    type: 'tool' as const,
    data: {
      toolUseId: segment.id ?? segment.tool_use_id ?? randomUUID(),
      name: segment.name ?? 'tool',
      status: 'call' as const,
      input: segment.input
    }
  };
}

function createToolResultEvent(segment: ToolResultSegment) {
  return {
    type: 'tool' as const,
    data: {
      toolUseId: segment.tool_use_id ?? segment.id ?? randomUUID(),
      name: segment.name ?? 'tool',
      status: 'result' as const,
      output: segment.content ?? segment.output,
      isError: segment.is_error ?? false,
      message: extractToolResultText(segment)
    }
  };
}

function deriveBlockId(
  message: SDKPartialAssistantMessage,
  payload: Record<string, unknown>
): string {
  if (typeof payload.index === 'number') {
    return `${message.session_id || message.uuid || 'session'}-block-${payload.index}`;
  }
  return `${message.session_id || message.uuid || 'session'}-block`;
}

function extractTextDelta(message: SDKPartialAssistantMessage) {
  const eventPayload = message.event as unknown;
  if (!isRecord(eventPayload)) return '';

  const delta = eventPayload.delta;
  if (!delta) return '';

  if (typeof delta === 'string') {
    return delta;
  }

  if (isRecord(delta)) {
    if (typeof delta.text === 'string') {
      return delta.text;
    }

    if (Array.isArray(delta.content)) {
      return delta.content
        .map((entry) => (isTextDeltaEntry(entry) ? entry.text ?? '' : ''))
        .join('');
    }
  }

  return '';
}

function extractStopReason(message: SDKAssistantMessage) {
  const payload = message.message as unknown;
  if (isRecord(payload) && typeof payload.stop_reason === 'string') {
    return payload.stop_reason;
  }
  return null;
}

function extractToolResultText(segment: ToolResultSegment) {
  if (typeof segment.output === 'string') {
    return segment.output;
  }
  if (Array.isArray(segment.content)) {
    return segment.content
      .map((entry) => {
        if (entry?.type === 'text') {
          return entry.text ?? '';
        }
        return '';
      })
      .join('')
      .trim();
  }
  return undefined;
}

type AssistantContentSegment = {
  type?: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: Array<{ type?: string; text?: string }>;
  output?: unknown;
  is_error?: boolean;
  parent_tool_use_id?: string | null;
};

type ToolUseSegment = AssistantContentSegment & {
  type: 'tool_use';
};

type ToolResultSegment = AssistantContentSegment & {
  type: 'tool_result';
};

type TextDeltaEntry = {
  type?: string;
  text?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTextDeltaEntry(entry: unknown): entry is TextDeltaEntry {
  return isRecord(entry) && typeof entry.text === 'string';
}
