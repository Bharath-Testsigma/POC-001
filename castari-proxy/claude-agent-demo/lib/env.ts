import { z } from 'zod';

const envSchema = z.object({
  ANTHROPIC_API_KEY: z
    .string({
      required_error: 'ANTHROPIC_API_KEY is required'
    })
    .min(1, 'ANTHROPIC_API_KEY cannot be empty'),
  CASTARI_WORKER_URL: z
    .string({ required_error: 'CASTARI_WORKER_URL is required' })
    .url('CASTARI_WORKER_URL must be a valid URL')
    .default('http://127.0.0.1:8787/v1/messages'),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  CASTARI_WORKER_TOKEN: z.string().min(1).optional(),
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
  CASTARI_WORKER_URL: process.env.CASTARI_WORKER_URL,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  CASTARI_WORKER_TOKEN: process.env.CASTARI_WORKER_TOKEN,
  CLAUDE_MODEL: process.env.CLAUDE_MODEL,
  CASTARI_SUBAGENT_MODEL: process.env.CASTARI_SUBAGENT_MODEL,
  AGENT_PERMISSION_MODE: process.env.AGENT_PERMISSION_MODE,
  AGENT_ENABLE_PARTIALS: process.env.AGENT_ENABLE_PARTIALS
});

export const PROJECT_CWD = process.cwd();
