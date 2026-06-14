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
    'TWITTER_JINA_BASE_URL',
    'TWITTER_OEMBED_BASE_URL',
    'TWITTER_SYNDICATION_BASE_URL',
    'TWITTER_SYNDICATION_JINA_BASE_URL',
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

  it('falls back across embedded Twitter providers', async () => {
    mutableEnv.FXEMBED_PUBLIC_BASE_URL = 'https://primary.example';
    mutableEnv.FXEMBED_FALLBACK_BASE_URL = 'https://fallback.example';
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }))
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }))
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }))
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tweet: {
              author: {
                name: 'Alice',
                screen_name: 'alice',
              },
              text: 'Recovered by fallback',
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
        platform: 'Twitter',
        text: 'Recovered by fallback',
      })
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'https://primary.example/alice/status/123',
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': expect.any(String),
        }),
      })
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      5,
      'https://fallback.example/alice/status/123',
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': expect.any(String),
        }),
      })
    );
  });

  it('returns a minimal embedded Twitter preview when providers fail', async () => {
    mutableEnv.FXEMBED_PUBLIC_BASE_URL = 'https://primary.example';
    mutableEnv.FXEMBED_FALLBACK_BASE_URL = 'https://fallback.example';
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('forbidden', { status: 403 })
    );

    await expect(
      getMediaPreview('https://x.com/alice/status/123')
    ).resolves.toEqual(
      expect.objectContaining({
        canonicalUrl: 'https://x.com/alice/status/123',
        media: [],
        platform: 'Twitter',
        sourceUrl: 'https://x.com/alice/status/123',
        title: 'Twitter post',
      })
    );
  });

  it('uses the Jina Twitter fallback when direct providers fail', async () => {
    mutableEnv.FXEMBED_PUBLIC_BASE_URL = 'https://primary.example';
    mutableEnv.FXEMBED_FALLBACK_BASE_URL = 'https://fallback.example';
    mutableEnv.TWITTER_JINA_BASE_URL = 'https://jina.example';
    const fetchMock = vi.spyOn(global, 'fetch');
    for (let index = 0; index < 12; index += 1) {
      fetchMock.mockResolvedValueOnce(
        new Response('forbidden', { status: 403 })
      );
    }
    fetchMock.mockResolvedValueOnce(
      new Response(
        [
          'Title:',
          '',
          'Markdown Content:',
          JSON.stringify({
            tweet: {
              author: {
                name: 'Alice',
                screen_name: 'alice',
              },
              media: {
                all: [
                  {
                    type: 'photo',
                    url: 'https://cdn.example/photo.jpg',
                  },
                ],
              },
              text: 'Recovered by Jina',
              url: 'https://x.com/alice/status/123',
            },
          }),
        ].join('\n')
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
        text: 'Recovered by Jina',
      })
    );
    expect(global.fetch).toHaveBeenLastCalledWith(
      'https://jina.example/alice/status/123',
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': expect.any(String),
        }),
      })
    );
  });

  it('uses Twitter oEmbed when direct and Jina providers fail', async () => {
    mutableEnv.FXEMBED_PUBLIC_BASE_URL = 'https://primary.example';
    mutableEnv.FXEMBED_FALLBACK_BASE_URL = 'https://fallback.example';
    mutableEnv.TWITTER_JINA_BASE_URL = 'https://jina.example';
    mutableEnv.TWITTER_OEMBED_BASE_URL = 'https://oembed.example';
    mutableEnv.TWITTER_SYNDICATION_BASE_URL = 'https://syndication.example';
    mutableEnv.TWITTER_SYNDICATION_JINA_BASE_URL =
      'https://syndication-jina.example';
    const fetchMock = vi.spyOn(global, 'fetch');
    for (let index = 0; index < 16; index += 1) {
      fetchMock.mockResolvedValueOnce(
        new Response('forbidden', { status: 403 })
      );
    }
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 })
    );
    fetchMock.mockResolvedValueOnce(new Response('empty', { status: 502 }));
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          author_name: 'Alice',
          author_url: 'https://x.com/alice',
          html: '<blockquote><p>Hello<br>from oEmbed <a href="https://t.co/a">pic.twitter.com/a</a></p></blockquote>',
          url: 'https://x.com/alice/status/123',
        }),
        { status: 200 }
      )
    );

    await expect(
      getMediaPreview('https://x.com/alice/status/123')
    ).resolves.toEqual(
      expect.objectContaining({
        authorHandle: '@alice',
        authorName: 'Alice',
        media: [],
        platform: 'Twitter',
        text: 'Hello\nfrom oEmbed',
        title: 'Hello',
      })
    );
  });

  it('uses Twitter syndication fallback with media details', async () => {
    mutableEnv.FXEMBED_PUBLIC_BASE_URL = 'https://primary.example';
    mutableEnv.FXEMBED_FALLBACK_BASE_URL = 'https://fallback.example';
    mutableEnv.TWITTER_JINA_BASE_URL = 'https://jina.example';
    mutableEnv.TWITTER_SYNDICATION_BASE_URL = 'https://syndication.example';
    const fetchMock = vi.spyOn(global, 'fetch');
    for (let index = 0; index < 16; index += 1) {
      fetchMock.mockResolvedValueOnce(
        new Response('forbidden', { status: 403 })
      );
    }
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          created_at: '2026-06-07T21:20:00.000Z',
          entities: {
            urls: [
              {
                expanded_url: 'https://github.com/example/project',
                url: 'https://t.co/source',
              },
            ],
          },
          favorite_count: 333,
          mediaDetails: [
            {
              media_url_https: 'https://pbs.twimg.com/media/photo.png',
              type: 'photo',
            },
          ],
          photos: [
            {
              url: 'https://pbs.twimg.com/media/photo-from-photos.png',
            },
          ],
          text: 'Recovered with media https://t.co/source',
          user: {
            name: 'Alice',
            profile_image_url_https: 'https://pbs.twimg.com/profile.jpg',
            screen_name: 'alice',
          },
        }),
        { status: 200 }
      )
    );

    await expect(
      getMediaPreview('https://x.com/alice/status/123')
    ).resolves.toEqual(
      expect.objectContaining({
        authorAvatarUrl: 'https://pbs.twimg.com/profile.jpg',
        authorHandle: '@alice',
        authorName: 'Alice',
        likes: 333,
        media: [
          expect.objectContaining({
            previewUrl: 'https://pbs.twimg.com/media/photo.png',
            type: 'image',
          }),
          expect.objectContaining({
            previewUrl: 'https://pbs.twimg.com/media/photo-from-photos.png',
            type: 'image',
          }),
        ],
        platform: 'Twitter',
        text: 'Recovered with media https://github.com/example/project',
      })
    );
  });

  it('uses Jina-wrapped Twitter syndication fallback with media details', async () => {
    mutableEnv.FXEMBED_PUBLIC_BASE_URL = 'https://primary.example';
    mutableEnv.FXEMBED_FALLBACK_BASE_URL = 'https://fallback.example';
    mutableEnv.TWITTER_JINA_BASE_URL = 'https://jina.example';
    mutableEnv.TWITTER_SYNDICATION_BASE_URL = 'https://syndication.example';
    mutableEnv.TWITTER_SYNDICATION_JINA_BASE_URL =
      'https://syndication-jina.example';
    const fetchMock = vi.spyOn(global, 'fetch');
    for (let index = 0; index < 16; index += 1) {
      fetchMock.mockResolvedValueOnce(
        new Response('forbidden', { status: 403 })
      );
    }
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          [
            'Title:',
            '',
            'Markdown Content:',
            JSON.stringify({
              created_at: '2026-06-07T21:20:00.000Z',
              favorite_count: 333,
              id_str: '123',
              mediaDetails: [
                {
                  media_url_https: 'https://pbs.twimg.com/media/photo.png',
                  type: 'photo',
                },
              ],
              text: 'Recovered with wrapped syndication',
              user: {
                name: 'Alice',
                profile_image_url_https: 'https://pbs.twimg.com/profile.jpg',
                screen_name: 'alice',
              },
            }),
          ].join('\n')
        )
      );

    await expect(
      getMediaPreview('https://x.com/alice/status/123')
    ).resolves.toEqual(
      expect.objectContaining({
        authorHandle: '@alice',
        canonicalUrl: 'https://x.com/alice/status/123',
        media: [
          expect.objectContaining({
            previewUrl: 'https://pbs.twimg.com/media/photo.png',
          }),
        ],
        text: 'Recovered with wrapped syndication',
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

  it('does not call remote translation when translate provider URL is missing', async () => {
    mutableEnv.MEDIA_MODE = 'remote';
    mutableEnv.MEDIA_SERVICE_BASE_URL = 'https://media-service.example';
    mutableEnv.TRANSLATE_PROVIDER = 'libretranslate';
    const fetchMock = vi.spyOn(global, 'fetch');

    await expect(
      translateMediaText({
        sourceUrl: 'https://x.com/user/status/1',
        targetLanguage: 'zh-TW',
        text: 'Hello world',
      })
    ).rejects.toThrow('Translate service is not configured.');
    expect(fetchMock).not.toHaveBeenCalled();
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
