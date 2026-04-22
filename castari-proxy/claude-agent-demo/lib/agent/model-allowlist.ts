import { ATTO_MODEL_OPTIONS, PORTKEY_MODEL_OPTIONS } from '@/lib/agent/atto-config';

export const ALLOWED_DEMO_MODELS = Object.freeze([
  ...ATTO_MODEL_OPTIONS.map((option) => option.value),
  ...PORTKEY_MODEL_OPTIONS.map((option) => option.value),
]);

const ALLOWED_DEMO_MODEL_SET = new Set(ALLOWED_DEMO_MODELS);
const ALLOWED_PORTKEY_MODEL_SET = new Set(
  PORTKEY_MODEL_OPTIONS.map((option) => normalizePortkeyModel(option.value))
);

export function isAllowedDemoModel(model: string): boolean {
  return ALLOWED_DEMO_MODEL_SET.has(model);
}

export function isAllowedPortkeyRouteModel(model: string): boolean {
  try {
    return ALLOWED_PORTKEY_MODEL_SET.has(normalizePortkeyModel(model));
  } catch {
    return false;
  }
}

function normalizePortkeyModel(model: string): string {
  const { provider, wireModel } = resolvePortkeyModel(model);
  return `${provider}:${wireModel}`;
}

function resolvePortkeyModel(model: string): { provider: string; wireModel: string } {
  if (model.startsWith('pk:')) {
    const slug = model.slice(3);
    const slash = slug.indexOf('/');
    if (slash < 0) {
      return { provider: 'anthropic', wireModel: slug };
    }
    return {
      provider: slug.slice(0, slash),
      wireModel: slug.slice(slash + 1),
    };
  }

  if (
    model.startsWith('gpt-') ||
    model.startsWith('o1') ||
    model.startsWith('o3') ||
    model.startsWith('o4')
  ) {
    return { provider: 'openai', wireModel: model };
  }

  if (model.startsWith('gemini')) {
    return { provider: 'google', wireModel: model };
  }

  return { provider: 'anthropic', wireModel: model };
}
