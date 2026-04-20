import type {
  SDKAssistantMessage,
  SDKPartialAssistantMessage,
  SDKResultMessage
} from '@anthropic-ai/claude-agent-sdk';
import type {
  BetaMessage as APIAssistantMessage,
  BetaRawMessageStreamEvent as RawMessageStreamEvent
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs';
import type { UUID } from 'crypto';
import { describe, expect, it } from 'vitest';
import { mapMessageToUIEvents } from '@/lib/agent/events';

const uuid: UUID =
  '123e4567-e89b-12d3-a456-426614174000' as UUID;

describe('mapMessageToUIEvents', () => {
  it('maps assistant messages into UI events', () => {
    const assistantMessage: SDKAssistantMessage = {
      type: 'assistant',
      uuid,
      session_id: 'session-1',
      parent_tool_use_id: null,
      message: {
        id: 'msg_1',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello world' }],
        stop_reason: 'end_turn'
      } as APIAssistantMessage
    };

    expect(mapMessageToUIEvents(assistantMessage)).toEqual([
      {
        type: 'assistant',
        data: { text: 'Hello world', stop_reason: 'end_turn' }
      }
    ]);
  });

  it('maps partial stream events into text deltas', () => {
    const partialMessage: SDKPartialAssistantMessage = {
      type: 'stream_event',
      uuid,
      session_id: 'session-1',
      parent_tool_use_id: null,
      event: { delta: { text: 'Partial ' } } as RawMessageStreamEvent
    };

    expect(mapMessageToUIEvents(partialMessage)).toEqual([
      {
        type: 'partial',
        data: { textDelta: 'Partial ' }
      }
    ]);
  });

  it('maps successful results into usage summaries', () => {
    const resultMessage: SDKResultMessage = {
      type: 'result',
      subtype: 'success',
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0
      },
      total_cost_usd: 0.001,
      duration_ms: 1000,
      duration_api_ms: 800,
      is_error: false,
      num_turns: 1,
      result: 'complete',
      modelUsage: {},
      permission_denials: [],
      uuid,
      session_id: 'session-1'
    };

    expect(mapMessageToUIEvents(resultMessage)).toEqual([
      {
        type: 'result',
        data: {
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0
          },
          total_cost_usd: 0.001,
          duration_ms: 1000,
          num_turns: 1,
          stop_reason: 'complete'
        }
      }
    ]);
  });

  it('emits tool call events from assistant content', () => {
    const assistantMessage: SDKAssistantMessage = {
      type: 'assistant',
      uuid,
      session_id: 'session-1',
      parent_tool_use_id: null,
      message: {
        id: 'msg_tool',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_1',
            name: 'web_search',
            input: { query: 'news' }
          }
        ]
      } as APIAssistantMessage
    };

    expect(mapMessageToUIEvents(assistantMessage)).toEqual([
      {
        type: 'tool',
        data: {
          toolUseId: 'tool_1',
          name: 'web_search',
          status: 'call',
          input: { query: 'news' }
        }
      }
    ]);
  });

  it('emits tool result events from assistant content', () => {
    const assistantMessage: SDKAssistantMessage = {
      type: 'assistant',
      uuid,
      session_id: 'session-1',
      parent_tool_use_id: null,
      message: {
        id: 'msg_tool_result',
        role: 'assistant',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tool_1',
            name: 'web_search',
            content: [{ type: 'text', text: 'Search complete' }]
          }
        ]
      } as APIAssistantMessage
    };

    expect(mapMessageToUIEvents(assistantMessage)).toEqual([
      {
        type: 'tool',
        data: {
          toolUseId: 'tool_1',
          name: 'web_search',
          status: 'result',
          output: [{ type: 'text', text: 'Search complete' }],
          message: 'Search complete',
          isError: false
        }
      }
    ]);
  });

  it('emits thinking completion events from assistant content', () => {
    const assistantMessage: SDKAssistantMessage = {
      type: 'assistant',
      uuid,
      session_id: 'session-1',
      parent_tool_use_id: null,
      message: {
        id: 'msg_think',
        role: 'assistant',
        content: [{ type: 'thinking', thinking: 'Reason step by step' }]
      } as APIAssistantMessage
    };

    expect(mapMessageToUIEvents(assistantMessage)).toEqual([
      {
        type: 'thinking',
        data: {
          blockId: uuid,
          status: 'complete',
          text: 'Reason step by step',
          redacted: false
        }
      }
    ]);
  });

  it('emits thinking delta events from streaming updates', () => {
    const streamMessage: SDKPartialAssistantMessage = {
      type: 'stream_event',
      uuid,
      session_id: 'session-1',
      parent_tool_use_id: null,
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'Plan action' }
      } as unknown as RawMessageStreamEvent
    };

    expect(mapMessageToUIEvents(streamMessage)).toEqual([
      {
        type: 'thinking',
        data: {
          blockId: 'session-1-block-0',
          status: 'delta',
          text: 'Plan action',
          redacted: false
        }
      }
    ]);
  });
});
