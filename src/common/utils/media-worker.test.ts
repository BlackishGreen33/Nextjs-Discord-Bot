import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMediaGif,
  getMediaPreview,
  isMediaWorkerConfigured,
  translateMediaText,
} from './media-worker';

describe('media-worker utils', () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const ENV_KEYS = [
    'GIF_MODE',
    'GIF_SERVICE_BASE_URL',
    'GIF_SERVICE_TOKEN',
    'MEDIA_MODE',
    'MEDIA_SERVICE_BASE_URL',
    'MEDIA_SERVICE_TOKEN',
    'MEDIA_TIMEOUT_MS',
    'MEDIA_WORKER_BASE_URL',
    'MEDIA_WORKER_TOKEN',
    'TRANSLATE_API_BASE_URL',
    'TRANSLATE_PROVIDER',
  ] as const;
  const originalEnv = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]])
  ) as Record<(typeof ENV_KEYS)[number], string | undefined>;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    for (const key of ENV_KEYS) {
      delete mutableEnv[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) {
        delete mutableEnv[key];
      } else {
        mutableEnv[key] = originalEnv[key];
      }
    }
  });

  it('returns a minimal preview when media mode is disabled', async () => {
    mutableEnv.MEDIA_MODE = 'disabled';

    await expect(
      getMediaPreview('https://pixiv.net/artworks/1')
    ).resolves.toEqual(
      expect.objectContaining({
        media: [],
        platform: 'Pixiv',
        sourceUrl: 'https://pixiv.net/artworks/1',
      })
    );
  });

  it('maps preview payload from the remote media service', async () => {
    mutableEnv.MEDIA_MODE = 'remote';
    mutableEnv.MEDIA_SERVICE_BASE_URL = 'https://media-service.example';
    mutableEnv.MEDIA_SERVICE_TOKEN = 'worker-token';
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          authorHandle: '@alice',
          authorName: 'Alice',
          media: [
            {
              gifConvertible: true,
              previewUrl: 'https://cdn.example/thumb.jpg',
              sourceUrl: 'https://cdn.example/video.mp4',
              type: 'video',
            },
          ],
          platform: 'Pixiv',
          sourceUrl: 'https://pixiv.net/artworks/1',
          text: 'Hello world',
          title: 'Hello world',
        }),
        { status: 200 }
      )
    );

    await expect(
      getMediaPreview('https://pixiv.net/artworks/1')
    ).resolves.toEqual(
      expect.objectContaining({
        authorHandle: '@alice',
        media: [
          expect.objectContaining({
            gifConvertible: true,
            previewUrl: 'https://cdn.example/thumb.jpg',
            sourceUrl: 'https://cdn.example/video.mp4',
            type: 'video',
          }),
        ],
      })
    );
    expect(global.fetch).toHaveBeenCalledWith(
      'https://media-service.example/v1/preview',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer worker-token',
        }),
      })
    );
  });

  it('uses embedded preview providers by default', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 200,
          message: 'OK',
          tweet: {
            author: {
              avatar_url: 'https://cdn.example/avatar.jpg',
              name: 'Alice',
              screen_name: 'alice',
            },
            created_at: 'Tue Mar 03 11:29:42 +0000 2026',
            likes: 123,
            media: {
              all: [
                {
                  type: 'photo',
                  url: 'https://cdn.example/photo.jpg',
                },
              ],
            },
            replies: 4,
            retweets: 5,
            text: 'Hello fallback',
            url: 'https://x.com/alice/status/123',
          },
        }),
        { status: 200 }
      )
    );

    await expect(
      getMediaPreview('https://x.com/alice/status/123')
    ).resolves.toEqual(
      expect.objectContaining({
        authorHandle: '@alice',
        media: [
          expect.objectContaining({
            previewUrl: 'https://cdn.example/photo.jpg',
            type: 'image',
          }),
        ],
        platform: 'Twitter',
      })
    );
  });

  it('supports legacy media worker env aliases for remote mode', () => {
    mutableEnv.MEDIA_WORKER_BASE_URL = 'https://legacy-worker.example';

    expect(isMediaWorkerConfigured()).toBe(true);
  });

  it('translates media text through the embedded translate provider', async () => {
    mutableEnv.MEDIA_MODE = 'embedded';
    mutableEnv.TRANSLATE_PROVIDER = 'libretranslate';
    mutableEnv.TRANSLATE_API_BASE_URL = 'https://translate.example';
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          provider: 'translate-api',
          translatedText: '你好世界',
        }),
        { status: 200 }
      )
    );

    await expect(
      translateMediaText({
        sourceUrl: 'https://x.com/user/status/1',
        targetLanguage: 'zh-TW',
        text: 'Hello world',
      })
    ).resolves.toEqual({
      provider: 'translate-api',
      translatedText: '你好世界',
    });
  });

  it('routes GIF conversion to the direct gif service in embedded mode', async () => {
    mutableEnv.MEDIA_MODE = 'embedded';
    mutableEnv.GIF_MODE = 'remote';
    mutableEnv.GIF_SERVICE_BASE_URL = 'https://gif.example';
    mutableEnv.GIF_SERVICE_TOKEN = 'gif-token';
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          gifUrl: 'https://gif.example/artifacts/1.gif',
          provider: 'render-gif',
          status: 'ready',
        }),
        { status: 200 }
      )
    );

    await expect(
      createMediaGif({
        channelId: 'channel-1',
        guildId: 'guild-1',
        mediaUrl: 'https://cdn.example/video.mp4',
        requesterId: 'user-1',
        sourceUrl: 'https://x.com/user/status/1',
      })
    ).resolves.toEqual({
      expiresAt: null,
      gifUrl: 'https://gif.example/artifacts/1.gif',
      message: null,
      provider: 'render-gif',
      status: 'ready',
    });
  });
});
