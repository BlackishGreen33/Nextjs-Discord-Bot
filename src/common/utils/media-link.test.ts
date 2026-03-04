import { describe, expect, it } from 'vitest';

import {
  buildMediaButtonCustomId,
  extractFirstSupportedMediaUrl,
  normalizeMediaUrl,
  parseMediaButtonCustomId,
} from './media-link';

describe('media-link utils', () => {
  it('normalizes supported media URL', () => {
    expect(normalizeMediaUrl('https://x.com/user/status/1')).toBe(
      'https://x.com/user/status/1'
    );
  });

  it('rejects unsupported domains', () => {
    expect(normalizeMediaUrl('https://example.com/video/1')).toBeNull();
  });

  it('extracts first supported URL from plain text', () => {
    const content =
      'first https://example.com and then https://twitter.com/user/status/2 end';

    expect(extractFirstSupportedMediaUrl(content)).toBe(
      'https://twitter.com/user/status/2'
    );
  });

  it('builds and parses media button custom id', () => {
    const customId = buildMediaButtonCustomId('audio', 'user-123');

    expect(customId).toBe('dl:v1:audio:user-123');
    expect(parseMediaButtonCustomId(customId)).toEqual({
      action: 'audio',
      ownerUserId: 'user-123',
    });
  });

  it('honors MEDIA_ALLOWED_DOMAINS override', () => {
    const previousValue = process.env.MEDIA_ALLOWED_DOMAINS;
    process.env.MEDIA_ALLOWED_DOMAINS = 'example.com';

    try {
      expect(normalizeMediaUrl('https://x.com/user/status/1')).toBeNull();
      expect(normalizeMediaUrl('https://example.com/path')).toBe(
        'https://example.com/path'
      );
    } finally {
      process.env.MEDIA_ALLOWED_DOMAINS = previousValue;
    }
  });
});
