import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMediaGif,
  getMediaPreview,
  translateMediaText,
} from './media-worker';

describe('media-worker utils', () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const previousBaseUrl = process.env.MEDIA_WORKER_BASE_URL;
  const previousToken = process.env.MEDIA_WORKER_TOKEN;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    delete mutableEnv.MEDIA_WORKER_BASE_URL;
    delete mutableEnv.MEDIA_WORKER_TOKEN;
  });

  afterEach(() => {
    if (previousBaseUrl === undefined) {
      delete mutableEnv.MEDIA_WORKER_BASE_URL;
    } else {
      mutableEnv.MEDIA_WORKER_BASE_URL = previousBaseUrl;
    }

    if (previousToken === undefined) {
      delete mutableEnv.MEDIA_WORKER_TOKEN;
    } else {
      mutableEnv.MEDIA_WORKER_TOKEN = previousToken;
    }
  });

  it('returns a minimal preview when worker config is absent', async () => {
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

  it('maps preview payload from the external worker', async () => {
    mutableEnv.MEDIA_WORKER_BASE_URL = 'https://media-worker.example';
    mutableEnv.MEDIA_WORKER_TOKEN = 'worker-token';
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
  });

  it('falls back to direct Twitter providers when the worker path fails', async () => {
    mutableEnv.MEDIA_WORKER_BASE_URL = 'https://media-worker.example';
    mutableEnv.MEDIA_WORKER_TOKEN = 'worker-token';
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'worker blocked' }), {
          status: 502,
        })
      )
      .mockResolvedValueOnce(
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

  it('translates media text through the worker', async () => {
    mutableEnv.MEDIA_WORKER_BASE_URL = 'https://media-worker.example';
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

  it('returns an error result when GIF conversion fails', async () => {
    mutableEnv.MEDIA_WORKER_BASE_URL = 'https://media-worker.example';
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'GIF conversion failed' }), {
        status: 502,
      })
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
      gifUrl: null,
      message: 'GIF conversion failed',
      provider: null,
      status: 'error',
    });
  });
});
