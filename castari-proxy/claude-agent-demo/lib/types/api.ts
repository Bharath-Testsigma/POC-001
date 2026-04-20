import type { ToolMode } from '@/lib/policy/permission';

export type ChatMode = ToolMode;

export type ThinkingConfig = {
  enabled: boolean;
  budgetTokens: number;
};

export type ImagePayload = {
  id: string;
  mimeType: string;
  base64: string;
  size: number;
};

export interface ChatRequestBody {
  message: string;
  sessionId?: string;
  useProjectInstructions?: boolean;
  toolMode?: ChatMode;
  images?: ImagePayload[];
  thinking?: ThinkingConfig;
}
