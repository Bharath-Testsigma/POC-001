import { z } from 'zod';

const envSchema = z.object({
  ANTHROPIC_API_KEY: z
    .string({
      required_error: 'ANTHROPIC_API_KEY is required'
    })
    .min(1, 'ANTHROPIC_API_KEY cannot be empty'),
  GEMINI_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  PORTKEY_API_KEY: z.string().min(1).optional(),
  CLAUDE_MODEL: z.string().min(1).optional(),
  CASTARI_SUBAGENT_MODEL: z.string().min(1).optional(),
  AGENT_PERMISSION_MODE: z
    .enum(['default', 'acceptEdits', 'bypassPermissions', 'plan'])
    .optional(),
  AGENT_ENABLE_PARTIALS: z.enum(['true', 'false']).optional()
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse({
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  PORTKEY_API_KEY: process.env.PORTKEY_API_KEY,
  CLAUDE_MODEL: process.env.CLAUDE_MODEL,
  CASTARI_SUBAGENT_MODEL: process.env.CASTARI_SUBAGENT_MODEL,
  AGENT_PERMISSION_MODE: process.env.AGENT_PERMISSION_MODE,
  AGENT_ENABLE_PARTIALS: process.env.AGENT_ENABLE_PARTIALS
});

export const PROJECT_CWD = process.cwd();
