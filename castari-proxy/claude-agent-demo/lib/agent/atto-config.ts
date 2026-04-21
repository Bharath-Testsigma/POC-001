// Client-safe constants — no Node.js imports

export const ATTO_MODEL_OPTIONS = [
  // Anthropic — direct API, no credits needed
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'Anthropic' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', provider: 'Anthropic' },

  // OpenRouter free tier (no credits needed)
  { value: 'or:openai/gpt-oss-20b:free', label: 'GPT-OSS 20B (free)', provider: 'OpenAI' },

  // Ollama — local models (requires: ollama serve + ollama pull <model>)
  { value: 'ollama:llama3.2', label: 'Llama 3.2 (3B)', provider: 'Ollama' },
  { value: 'ollama:llama3.1:8b', label: 'Llama 3.1 (8B)', provider: 'Ollama' },
  { value: 'ollama:mistral', label: 'Mistral 7B', provider: 'Ollama' },
  { value: 'ollama:qwen2.5:7b', label: 'Qwen 2.5 (7B)', provider: 'Ollama' },
  { value: 'ollama:phi4', label: 'Phi-4 (14B)', provider: 'Ollama' },

  // OpenRouter paid models (require credits at openrouter.ai/settings/credits)
  { value: 'or:google/gemini-2.5-flash-preview-05-20', label: 'Gemini 2.5 Flash', provider: 'Google' },
  { value: 'or:google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'Google' },
  { value: 'or:openai/gpt-4o-mini', label: 'GPT-4o Mini', provider: 'OpenAI' },
  { value: 'or:openai/gpt-4o', label: 'GPT-4o', provider: 'OpenAI' },
  { value: 'or:meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B', provider: 'Meta' },
  { value: 'or:mistralai/mistral-small-3.1-24b-instruct', label: 'Mistral Small 3.1', provider: 'Mistral' },
] as const;

export const APP_TYPE_OPTIONS = [
  { value: 'web', label: 'Web Application' },
  { value: 'mobile', label: 'Mobile Application' },
  { value: 'api', label: 'REST API' },
  { value: 'desktop', label: 'Desktop Application' },
] as const;
