import type { HookCallback, HookCallbackMatcher, HookEvent } from '@anthropic-ai/claude-agent-sdk';
import { transcriptStore } from '@/lib/store/transcripts';

type HooksMap = Partial<Record<HookEvent, HookCallbackMatcher[]>>;

const RECORDED_EVENTS: HookEvent[] = [
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PreCompact',
  'Notification',
  'Stop'
];

export function createTranscriptHooks(): HooksMap {
  const hooks: HooksMap = {};
  for (const eventName of RECORDED_EVENTS) {
    hooks[eventName] = [{ hooks: [recordHook] }];
  }
  return hooks;
}

const recordHook: HookCallback = async (input) => {
  try {
    await transcriptStore.append(input.session_id, {
      ts: Date.now(),
      kind: `hook:${input.hook_event_name}`,
      payload: safePayload(input)
    });
  } catch (error) {
    console.error('Failed to record transcript hook', error);
  }

  return {};
};

function safePayload(payload: unknown) {
  try {
    return JSON.parse(
      JSON.stringify(payload, (_, value) => {
        if (typeof value === 'string' && value.length > 2000) {
          return `${value.slice(0, 2000)}…`;
        }
        return value;
      })
    );
  } catch {
    return { error: 'Unable to serialize payload' };
  }
}
