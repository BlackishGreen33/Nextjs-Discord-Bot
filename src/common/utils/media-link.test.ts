import { describe, expect, it } from 'vitest';

import {
  buildPreviewActionCustomId,
  extractFirstSupportedMediaUrl,
  normalizeMediaUrl,
  parseBlueskyPostUrl,
  parsePixivArtworkId,
  parsePreviewActionCustomId,
  parseTwitterStatusId,
} from './media-link';

describe('media-link utils', () => {
  it('normalizes supported media URLs', () => {
    expect(normalizeMediaUrl('https://x.com/user/status/1')).toBe(
      'https://x.com/user/status/1'
    );
    expect(normalizeMediaUrl('https://www.pixiv.net/artworks/123')).toBe(
      'https://www.pixiv.net/artworks/123'
    );
    expect(
      normalizeMediaUrl('https://bsky.app/profile/example.com/post/abc123')
    ).toBe('https://bsky.app/profile/example.com/post/abc123');
  });

  it('rejects unsupported domains', () => {
    expect(normalizeMediaUrl('https://example.com/post/1')).toBeNull();
  });

  it('extracts the first supported URL from text', () => {
    const content =
      'ignore https://example.com then use https://twitter.com/user/status/2';

    expect(extractFirstSupportedMediaUrl(content)).toBe(
      'https://twitter.com/user/status/2'
    );
  });

  it('builds and parses preview action custom ids', () => {
    const customId = buildPreviewActionCustomId(
      'translate',
      'user-123',
      'msg-9'
    );

    expect(customId).toBe('pv:v1:translate:user-123:msg-9');
    expect(parsePreviewActionCustomId(customId)).toEqual({
      action: 'translate',
      ownerUserId: 'user-123',
      sourceMessageId: 'msg-9',
    });
  });

  it('parses provider-specific identifiers from URLs', () => {
    expect(parseTwitterStatusId('https://x.com/user/status/202')).toBe('202');
    expect(parsePixivArtworkId('https://www.pixiv.net/artworks/123456')).toBe(
      '123456'
    );
    expect(
      parseBlueskyPostUrl('https://bsky.app/profile/alice.test/post/3kxz')
    ).toEqual({
      handle: 'alice.test',
      rkey: '3kxz',
    });
  });
});
