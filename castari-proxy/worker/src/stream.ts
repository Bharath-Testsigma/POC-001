import { OpenRouterToolCall } from './types';
import { mapStopReason } from './translator';
import { randomId } from './utils';

interface StreamOptions {
  originalModel: string;
}

interface ToolBlockState {
  index: number;
  name: string;
  id: string;
  buffer: string;
  open: boolean;
}

export function streamOpenRouterToAnthropic(upstream: Response, options: StreamOptions): Response {
  if (!upstream.body) throw new Error('Upstream response has no body to stream');

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = upstream.body.getReader();
  const messageId = randomId('msg');

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, payload: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
      };

      send('message_start', {
        type: 'message_start',
        message: {
          id: messageId,
          type: 'message',
          role: 'assistant',
          model: options.originalModel,
          content: [],
        },
      });

      let buffer = '';
      let textBlockOpen = false;
      let contentIndex = 0;
      let accumulatedStopReason: string | null = null;
      const toolBlocks = new Map<string, ToolBlockState>();

      const flushTextBlockStop = () => {
        if (textBlockOpen) {
          send('content_block_stop', { type: 'content_block_stop', index: 0 });
          textBlockOpen = false;
        }
      };

      const ensureTextBlock = () => {
        if (!textBlockOpen) {
          textBlockOpen = true;
          contentIndex = 0;
          send('content_block_start', {
            type: 'content_block_start',
            index: contentIndex,
            content_block: { type: 'text', text: '' },
          });
        }
      };

      const ensureToolBlock = (call: OpenRouterToolCall): ToolBlockState => {
        let state = toolBlocks.get(call.id);
        if (!state) {
          const index = toolBlocks.size + 1; // after primary text block
          state = { index, name: call.function.name, id: call.id, buffer: '', open: false };
          toolBlocks.set(call.id, state);
        }
        if (!state.open) {
          state.open = true;
          send('content_block_start', {
            type: 'content_block_start',
            index: state.index,
            content_block: { type: 'tool_use', id: state.id, name: state.name, input: {} },
          });
        }
        return state;
      };

      const handleToolCalls = (toolCalls?: OpenRouterToolCall[]) => {
        if (!toolCalls?.length) return;
        for (const call of toolCalls) {
          const state = ensureToolBlock(call);
          if (call.function.arguments) {
            state.buffer += call.function.arguments;
            send('content_block_delta', {
              type: 'content_block_delta',
              index: state.index,
              delta: { type: 'input_json_delta', partial_json: call.function.arguments },
            });
          }
        }
      };

      const handleChunk = (json: any) => {
        const choice = json?.choices?.[0];
        if (!choice) return;
        if (choice.delta?.content) {
          const delta = choice.delta.content;
          const text = typeof delta === 'string' ? delta : Array.isArray(delta) ? delta.map((d: any) => d?.text ?? '').join('') : '';
          if (text) {
            ensureTextBlock();
            send('content_block_delta', {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text },
            });
          }
        }

        handleToolCalls(choice.delta?.tool_calls);

        if (choice.finish_reason) {
          accumulatedStopReason = mapStopReason(choice.finish_reason);
        }

        if (json.usage) {
          send('message_delta', {
            type: 'message_delta',
            delta: {
              usage: {
                input_tokens: json.usage.prompt_tokens,
                output_tokens: json.usage.completion_tokens,
                reasoning_tokens: json.usage.reasoning_tokens,
              },
            },
          });
        }
      };

      const finalizeToolBlocks = () => {
        for (const block of toolBlocks.values()) {
          if (!block.open) continue;
          if (block.buffer) {
            send('content_block_delta', {
              type: 'content_block_delta',
              index: block.index,
              delta: { type: 'input_json_delta', partial_json: '' },
            });
          }
          send('content_block_stop', { type: 'content_block_stop', index: block.index });
          block.open = false;
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const rawEvent = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          processEvent(rawEvent.trim());
          boundary = buffer.indexOf('\n\n');
        }
      }

      flushTextBlockStop();
      finalizeToolBlocks();

      send('message_stop', {
        type: 'message_stop',
        stop_reason: accumulatedStopReason ?? 'end_turn',
      });
      controller.close();

      function processEvent(raw: string) {
        if (!raw || raw.startsWith(':')) return; // comment / keep-alive
        const lines = raw.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') {
            flushTextBlockStop();
            finalizeToolBlocks();
            return;
          }
          try {
            const parsed = JSON.parse(data);
            handleChunk(parsed);
          } catch (error) {
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
    },
    status: upstream.status,
  });
}
