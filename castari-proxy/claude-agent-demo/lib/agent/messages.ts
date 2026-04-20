import type { APIUserMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs';
import type { ImagePayload } from '@/lib/types/api';

export function buildUserMessageContent(
  text: string,
  images: ImagePayload[]
): APIUserMessage {
  const content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  > = [];

  const trimmed = text.trim();
  if (trimmed.length > 0) {
    content.push({ type: 'text', text: trimmed });
  }

  for (const image of images) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: image.mimeType,
        data: image.base64
      }
    });
  }

  if (content.length === 0) {
    throw new Error('Message content cannot be empty');
  }

  return {
    role: 'user',
    content
  };
}
