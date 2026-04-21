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

export const ATTO_MODEL_OPTIONS: AttoModelOption[] = [
  // Anthropic — direct API, no credits needed
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'Anthropic', toolUse: 'full', thinking: true },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', provider: 'Anthropic', toolUse: 'full', thinking: false },

  // OpenRouter free tier (no credits needed)
  { value: 'or:openai/gpt-oss-20b:free', label: 'GPT-OSS 20B (free)', provider: 'OpenAI', toolUse: 'limited', thinking: false, note: 'Small model — may miss tool calls' },

  // Ollama — local models (requires: ollama serve + ollama pull <model>)
  { value: 'ollama:gemma4:e4b', label: 'Gemma 4 (4B)', provider: 'Ollama', toolUse: 'poor', thinking: false, note: 'Tiny local model — tool calls unreliable' },
  { value: 'ollama:llama3.2', label: 'Llama 3.2 (3B)', provider: 'Ollama', toolUse: 'poor', thinking: false, note: 'Tiny local model — tool calls unreliable' },
  { value: 'ollama:llama3.1:8b', label: 'Llama 3.1 (8B)', provider: 'Ollama', toolUse: 'limited', thinking: false, note: 'May require retries for complex tool chains' },
  { value: 'ollama:mistral', label: 'Mistral 7B', provider: 'Ollama', toolUse: 'limited', thinking: false, note: 'May require retries for complex tool chains' },
  { value: 'ollama:qwen2.5:7b', label: 'Qwen 2.5 (7B)', provider: 'Ollama', toolUse: 'limited', thinking: false },
  { value: 'ollama:phi4', label: 'Phi-4 (14B)', provider: 'Ollama', toolUse: 'limited', thinking: false },

  // Google Gemini — direct API (GEMINI_API_KEY, no OpenRouter overhead)
  { value: 'g:gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'Google', toolUse: 'full', thinking: false },
  { value: 'g:gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'Google', toolUse: 'full', thinking: false },

  // OpenAI direct API (OPENAI_API_KEY)
  { value: 'o:gpt-4.1-mini', label: 'GPT-4.1 Mini', provider: 'OpenAI', toolUse: 'full', thinking: false },
  { value: 'o:gpt-4.1', label: 'GPT-4.1', provider: 'OpenAI', toolUse: 'full', thinking: false },
  { value: 'o:gpt-4o-mini', label: 'GPT-4o Mini', provider: 'OpenAI', toolUse: 'full', thinking: false },
  { value: 'o:gpt-4o', label: 'GPT-4o', provider: 'OpenAI', toolUse: 'full', thinking: false },

  // OpenRouter paid models (require credits at openrouter.ai/settings/credits)
  { value: 'or:meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B', provider: 'Meta', toolUse: 'full', thinking: false },
  { value: 'or:mistralai/mistral-small-3.1-24b-instruct', label: 'Mistral Small 3.1', provider: 'Mistral', toolUse: 'limited', thinking: false },
];

export const APP_TYPE_OPTIONS = [
  { value: 'web', label: 'Web Application' },
  { value: 'mobile', label: 'Mobile Application' },
  { value: 'api', label: 'REST API' },
  { value: 'desktop', label: 'Desktop Application' },
] as const;
