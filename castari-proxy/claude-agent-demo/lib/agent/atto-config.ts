// Client-safe constants — no Node.js imports

export const ATTO_MODEL_OPTIONS = [
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'Anthropic' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', provider: 'Anthropic' },
  { value: 'or:google/gemini-flash-1.5', label: 'Gemini Flash 1.5', provider: 'Google' },
  { value: 'or:google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'Google' },
  { value: 'or:openai/gpt-4o-mini', label: 'GPT-4o Mini', provider: 'OpenAI' },
  { value: 'or:openai/gpt-4o', label: 'GPT-4o', provider: 'OpenAI' },
  { value: 'or:meta-llama/llama-3.1-8b-instruct', label: 'Llama 3.1 8B', provider: 'Meta' },
  { value: 'or:mistralai/mistral-7b-instruct', label: 'Mistral 7B', provider: 'Mistral' },
] as const;

export const APP_TYPE_OPTIONS = [
  { value: 'web', label: 'Web Application' },
  { value: 'mobile', label: 'Mobile Application' },
  { value: 'api', label: 'REST API' },
  { value: 'desktop', label: 'Desktop Application' },
] as const;
