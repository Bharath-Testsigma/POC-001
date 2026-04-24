// Client-safe constants — no Node.js imports

// toolUse: 'full' = reliably calls tools as required; 'limited' = may miss tool calls or produce
// partial JSON; 'poor' = frequently fails to use tools correctly.
// thinking: whether the model supports Claude-style extended thinking / reasoning blocks.
export type ToolUseCapability = 'full' | 'limited' | 'poor';

export interface AttoModelOption {
  value: string;
  label: string;
  provider: string;
  toolUse: ToolUseCapability;
  thinking: boolean;
  note?: string;
}

export const PORTKEY_MODEL_OPTIONS: AttoModelOption[] = [
  // Anthropic via Portkey
  { value: 'pk:anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'Anthropic', toolUse: 'full', thinking: true },
  { value: 'pk:anthropic/claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', provider: 'Anthropic', toolUse: 'full', thinking: false },
  { value: 'pk:anthropic/claude-opus-4-5', label: 'Claude Opus 4.5', provider: 'Anthropic', toolUse: 'full', thinking: true },

  // OpenAI via Portkey
  { value: 'pk:openai/gpt-4.1', label: 'GPT-4.1', provider: 'OpenAI', toolUse: 'full', thinking: false },
  { value: 'pk:openai/gpt-4.1-mini', label: 'GPT-4.1 Mini', provider: 'OpenAI', toolUse: 'full', thinking: false },
  { value: 'pk:openai/gpt-4o', label: 'GPT-4o', provider: 'OpenAI', toolUse: 'full', thinking: false },
  { value: 'pk:openai/gpt-4o-mini', label: 'GPT-4o Mini', provider: 'OpenAI', toolUse: 'full', thinking: false },
  { value: 'pk:openai/o4-mini', label: 'o4-mini (reasoning)', provider: 'OpenAI', toolUse: 'full', thinking: false },
  { value: 'pk:openai/o3-mini', label: 'o3-mini (reasoning)', provider: 'OpenAI', toolUse: 'limited', thinking: false },

  // Google via Portkey
  { value: 'pk:google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'Google', toolUse: 'full', thinking: false },
  { value: 'pk:google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'Google', toolUse: 'full', thinking: false },
  { value: 'pk:google/gemini-2.0-flash', label: 'Gemini 2.0 Flash', provider: 'Google', toolUse: 'full', thinking: false },
  { value: 'pk:google/gemini-1.5-pro', label: 'Gemini 1.5 Pro', provider: 'Google', toolUse: 'full', thinking: false },
  { value: 'pk:google/gemini-1.5-flash', label: 'Gemini 1.5 Flash', provider: 'Google', toolUse: 'full', thinking: false },
];

export const APP_TYPE_OPTIONS = [
  { value: 'web', label: 'Web Application' },
  { value: 'mobile', label: 'Mobile Application' },
  { value: 'api', label: 'REST API' },
  { value: 'desktop', label: 'Desktop Application' },
] as const;
