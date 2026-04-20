import { describe, expect, it } from 'vitest';
import { buildUserMessageContent } from '@/lib/agent/messages';
import type { ImagePayload } from '@/lib/types/api';

const sampleImage: ImagePayload = {
  id: 'img-1',
  mimeType: 'image/png',
  base64: 'ZmFrZUJhc2U2NERhdGE=',
  size: 1024
};

describe('buildUserMessageContent', () => {
  it('creates a text-only message when no images are provided', () => {
    const result = buildUserMessageContent('Hello world', []);
    expect(result.content).toEqual([{ type: 'text', text: 'Hello world' }]);
  });

  it('creates a mixed content message with text and images', () => {
    const result = buildUserMessageContent('Caption', [sampleImage]);
    expect(result.content).toHaveLength(2);
    expect(result.content?.[0]).toEqual({ type: 'text', text: 'Caption' });
    expect(result.content?.[1]).toEqual({
      type: 'image',
      source: {
        type: 'base64',
        media_type: sampleImage.mimeType,
        data: sampleImage.base64
      }
    });
  });

  it('creates an image-only message when text is empty', () => {
    const result = buildUserMessageContent('', [sampleImage]);
    expect(result.content).toHaveLength(1);
    expect(result.content?.[0]).toMatchObject({
      type: 'image'
    });
  });

  it('throws when both text and images are missing', () => {
    expect(() => buildUserMessageContent('', [])).toThrow(/cannot be empty/i);
  });
});
