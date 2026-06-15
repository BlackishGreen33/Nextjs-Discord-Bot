import { beforeEach, describe, expect, it, vi } from 'vitest';

import worker from './index';

const env = {
  BLUESKY_PUBLIC_BASE_URL: 'https://public.api.bsky.app/xrpc',
  FXEMBED_PUBLIC_BASE_URL: 'https://api.fxtwitter.com',
  GIF_API_BASE_URL: 'https://gif.example',
  GIF_API_TOKEN: 'gif-token',
  PHIXIV_PUBLIC_BASE_URL: 'https://phixiv.net',
  WORKER_AUTH_TOKEN: 'worker-token',
};

const createRequest = (pathname: string, body?: unknown) =>
  new Request(`https://discord-media-proxy.example${pathname}`, {
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      Authorization: 'Bearer worker-token',
      'Content-Type': 'application/json',
    },
    method: body ? 'POST' : 'GET',
  });

describe('cloudflare media proxy', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('maps Twitter preview responses to the standard payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
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
                  thumbnail_url: 'https://cdn.example/thumb.jpg',
                  type: 'video',
                  url: 'https://cdn.example/video.mp4',
                  variants: [
                    {
                      bitrate: 1000000,
                      content_type: 'video/mp4',
                      url: 'https://cdn.example/video.mp4',
                    },
                  ],
                },
              ],
            },
            replies: 4,
            retweets: 5,
            text: 'Hello world',
            url: 'https://x.com/alice/status/123',
          },
        }),
        { status: 200 }
      )
    );

    const response = await worker.fetch(
      createRequest('/v1/preview', {
        sourceUrl: 'https://x.com/alice/status/123',
      }),
      env
    );
    const body = (await response.json()) as {
      authorHandle: string;
      media: Array<{ gifConvertible: boolean; type: string }>;
      platform: string;
    };

    expect(response.status).toBe(200);
    expect(body.platform).toBe('Twitter');
    expect(body.authorHandle).toBe('@alice');
    expect(body.media[0]).toEqual(
      expect.objectContaining({
        gifConvertible: true,
        type: 'video',
      })
    );
  });

  it('falls back to vxTwitter payload shape when fxTwitter fails', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            date: 'Wed Oct 05 18:40:30 +0000 2022',
            likes: 21664,
            media_extended: [
              {
                thumbnail_url: 'https://pbs.twimg.com/media/thumb.jpg',
                type: 'image',
                url: 'https://pbs.twimg.com/media/full.jpg',
              },
            ],
            replies: 2911,
            retweets: 3229,
            text: 'whoa, it works',
            tweetURL: 'https://twitter.com/Twitter/status/1577730467436138524',
            user_name: 'Twitter',
            user_screen_name: 'Twitter',
          }),
          { status: 200 }
        )
      );

    const response = await worker.fetch(
      createRequest('/v1/preview', {
        sourceUrl: 'https://x.com/Twitter/status/1577730467436138524',
      }),
      env
    );
    const body = (await response.json()) as {
      authorHandle: string;
      media: Array<{ previewUrl: string; type: string }>;
      platform: string;
    };

    expect(response.status).toBe(200);
    expect(body.platform).toBe('Twitter');
    expect(body.authorHandle).toBe('@Twitter');
    expect(body.media[0]).toEqual(
      expect.objectContaining({
        previewUrl: 'https://pbs.twimg.com/media/full.jpg',
        type: 'image',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://api.vxtwitter.com/Twitter/status/1577730467436138524',
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': expect.any(String),
        }),
      })
    );
  });

  it('tries the configured Twitter fallback provider before vxTwitter', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
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
              text: 'Recovered by configured fallback',
              url: 'https://x.com/alice/status/123',
            },
          }),
          { status: 200 }
        )
      );

    const response = await worker.fetch(
      createRequest('/v1/preview', {
        sourceUrl: 'https://x.com/alice/status/123',
      }),
      {
        ...env,
        FXEMBED_FALLBACK_BASE_URL: 'https://fallback.example',
        FXEMBED_PUBLIC_BASE_URL: 'https://primary.example',
      }
    );
    const body = (await response.json()) as {
      authorHandle: string;
      platform: string;
      text: string;
    };

    expect(response.status).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({
        authorHandle: '@alice',
        platform: 'Twitter',
        text: 'Recovered by configured fallback',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://primary.example/alice/status/123',
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': expect.any(String),
        }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'https://fallback.example/alice/status/123',
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': expect.any(String),
        }),
      })
    );
  });

  it('returns a minimal Twitter preview when all providers fail', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('forbidden', { status: 403 })
    );

    const response = await worker.fetch(
      createRequest('/v1/preview', {
        sourceUrl: 'https://x.com/alice/status/123',
      }),
      env
    );
    const body = (await response.json()) as {
      canonicalUrl: string;
      media: unknown[];
      platform: string;
      sourceUrl: string;
      title: string;
    };

    expect(response.status).toBe(200);
    expect(body).toEqual(
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
    const fetchMock = vi.spyOn(globalThis, 'fetch');
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

    const response = await worker.fetch(
      createRequest('/v1/preview', {
        sourceUrl: 'https://x.com/alice/status/123',
      }),
      {
        ...env,
        FXEMBED_FALLBACK_BASE_URL: 'https://fallback.example',
        FXEMBED_PUBLIC_BASE_URL: 'https://primary.example',
        TWITTER_JINA_BASE_URL: 'https://jina.example',
      }
    );
    const body = (await response.json()) as {
      authorHandle: string;
      media: Array<{ previewUrl: string; type: string }>;
      platform: string;
      text: string;
    };

    expect(response.status).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({
        authorHandle: '@alice',
        platform: 'Twitter',
        text: 'Recovered by Jina',
      })
    );
    expect(body.media[0]).toEqual(
      expect.objectContaining({
        previewUrl: 'https://cdn.example/photo.jpg',
        type: 'image',
      })
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://jina.example/alice/status/123',
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': expect.any(String),
        }),
      })
    );
  });

  it('uses Twitter oEmbed when direct and Jina providers fail', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
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

    const response = await worker.fetch(
      createRequest('/v1/preview', {
        sourceUrl: 'https://x.com/alice/status/123',
      }),
      {
        ...env,
        FXEMBED_FALLBACK_BASE_URL: 'https://fallback.example',
        FXEMBED_PUBLIC_BASE_URL: 'https://primary.example',
        TWITTER_JINA_BASE_URL: 'https://jina.example',
        TWITTER_OEMBED_BASE_URL: 'https://oembed.example',
        TWITTER_SYNDICATION_BASE_URL: 'https://syndication.example',
        TWITTER_SYNDICATION_JINA_BASE_URL: 'https://syndication-jina.example',
      }
    );
    const body = (await response.json()) as {
      authorHandle: string;
      authorName: string;
      media: unknown[];
      platform: string;
      text: string;
      title: string;
    };

    expect(response.status).toBe(200);
    expect(body).toEqual(
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
    const fetchMock = vi.spyOn(globalThis, 'fetch');
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
          card: {
            url: 'https://github.com/example/project',
            binding_values: {
              photo_image_full_size_large: {
                image_value: {
                  url: 'https://pbs.twimg.com/card_img/card.jpg',
                },
              },
            },
          },
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

    const response = await worker.fetch(
      createRequest('/v1/preview', {
        sourceUrl: 'https://x.com/alice/status/123',
      }),
      {
        ...env,
        FXEMBED_FALLBACK_BASE_URL: 'https://fallback.example',
        FXEMBED_PUBLIC_BASE_URL: 'https://primary.example',
        TWITTER_JINA_BASE_URL: 'https://jina.example',
        TWITTER_SYNDICATION_BASE_URL: 'https://syndication.example',
      }
    );
    const body = (await response.json()) as {
      authorAvatarUrl: string;
      authorHandle: string;
      authorName: string;
      likes: number;
      media: Array<{ previewUrl: string; type: string }>;
      platform: string;
      text: string;
    };

    expect(response.status).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({
        authorAvatarUrl: 'https://pbs.twimg.com/profile.jpg',
        authorHandle: '@alice',
        authorName: 'Alice',
        likes: 333,
        platform: 'Twitter',
        text: 'Recovered with media',
      })
    );
    expect(body.media[0]).toEqual(
      expect.objectContaining({
        previewUrl: 'https://pbs.twimg.com/media/photo.png',
        type: 'image',
      })
    );
    expect(body.media[1]).toEqual(
      expect.objectContaining({
        previewUrl: 'https://pbs.twimg.com/media/photo-from-photos.png',
        type: 'image',
      })
    );
    expect(body.media[2]).toEqual(
      expect.objectContaining({
        previewUrl: 'https://pbs.twimg.com/card_img/card.jpg',
        type: 'image',
      })
    );
  });

  it('uses Jina-wrapped Twitter syndication fallback with media details', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
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
              card: {
                url: 'https://github.com/example/project',
                binding_values: {
                  photo_image_full_size_large: {
                    image_value: {
                      url: 'https://pbs.twimg.com/card_img/card.jpg',
                    },
                  },
                },
              },
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

    const response = await worker.fetch(
      createRequest('/v1/preview', {
        sourceUrl: 'https://x.com/alice/status/123',
      }),
      {
        ...env,
        FXEMBED_FALLBACK_BASE_URL: 'https://fallback.example',
        FXEMBED_PUBLIC_BASE_URL: 'https://primary.example',
        TWITTER_JINA_BASE_URL: 'https://jina.example',
        TWITTER_SYNDICATION_BASE_URL: 'https://syndication.example',
        TWITTER_SYNDICATION_JINA_BASE_URL: 'https://syndication-jina.example',
      }
    );
    const body = (await response.json()) as {
      canonicalUrl: string;
      media: Array<{ previewUrl: string }>;
      text: string;
    };

    expect(response.status).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({
        canonicalUrl: 'https://x.com/alice/status/123',
        text: 'Recovered with wrapped syndication',
      })
    );
    expect(body.media[0]).toEqual(
      expect.objectContaining({
        previewUrl: 'https://pbs.twimg.com/media/photo.png',
      })
    );
    expect(body.media[1]).toEqual(
      expect.objectContaining({
        previewUrl: 'https://pbs.twimg.com/card_img/card.jpg',
      })
    );
  });

  it('maps Bluesky preview responses to the standard payload', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ did: 'did:plc:alice' }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            thread: {
              post: {
                author: {
                  avatar: 'https://cdn.bsky.app/avatar.jpg',
                  displayName: 'Alice',
                  handle: 'alice.test',
                },
                embed: {
                  $type: 'app.bsky.embed.images#view',
                  images: [
                    {
                      alt: 'Alt text',
                      fullsize: 'https://cdn.bsky.app/full.jpg',
                      thumb: 'https://cdn.bsky.app/thumb.jpg',
                    },
                  ],
                },
                likeCount: 12,
                record: {
                  createdAt: '2026-03-19T00:00:00.000Z',
                  text: 'Hello Bluesky',
                },
                replyCount: 3,
                repostCount: 4,
              },
            },
          }),
          { status: 200 }
        )
      );

    const response = await worker.fetch(
      createRequest('/v1/preview', {
        sourceUrl: 'https://bsky.app/profile/alice.test/post/3kxz',
      }),
      env
    );
    const body = (await response.json()) as {
      media: Array<{ previewUrl: string; type: string }>;
      platform: string;
    };

    expect(response.status).toBe(200);
    expect(body.platform).toBe('Bluesky');
    expect(body.media[0]).toEqual(
      expect.objectContaining({
        previewUrl: 'https://cdn.bsky.app/full.jpg',
        type: 'image',
      })
    );
  });

  it('proxies translation requests to the configured translate service', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ translatedText: '你好世界' }), {
        status: 200,
      })
    );

    const response = await worker.fetch(
      createRequest('/v1/translate', {
        sourceUrl: 'https://x.com/alice/status/123',
        targetLanguage: 'zh-TW',
        text: 'Hello world',
      }),
      {
        ...env,
        TRANSLATE_API_BASE_URL: 'https://translate.example',
      }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      provider: 'translate-api',
      translatedText: '你好世界',
    });
  });

  it('translates through Workers AI when configured', async () => {
    const aiRun = vi.fn().mockResolvedValue({
      translated_text: '您好世界',
    });

    const response = await worker.fetch(
      createRequest('/v1/translate', {
        sourceUrl: 'https://x.com/alice/status/123',
        targetLanguage: 'zh-TW',
        text: 'Hello world',
      }),
      {
        ...env,
        AI: {
          run: aiRun,
        },
        TRANSLATE_PROVIDER: 'workers-ai',
      }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      provider: 'workers-ai',
      translatedText: '您好世界',
    });
    expect(aiRun).toHaveBeenCalledWith('@cf/meta/m2m100-1.2b', {
      source_lang: 'english',
      target_lang: 'chinese',
      text: 'Hello world',
    });
  });

  it('detects Indonesian text for Workers AI translation', async () => {
    const aiRun = vi.fn().mockResolvedValue({
      translated_text: '你的 AI 代理寫了 80 行程式碼。',
    });

    const response = await worker.fetch(
      createRequest('/v1/translate', {
        sourceUrl: 'https://x.com/alice/status/123',
        targetLanguage: 'zh-TW',
        text: 'AI agent kamu nulis 80 baris code buat yang sebenarnya cuma butuh 1 baris?',
      }),
      {
        ...env,
        AI: {
          run: aiRun,
        },
        TRANSLATE_PROVIDER: 'workers-ai',
      }
    );

    expect(response.status).toBe(200);
    expect(aiRun).toHaveBeenCalledWith('@cf/meta/m2m100-1.2b', {
      source_lang: 'indonesian',
      target_lang: 'chinese',
      text: 'AI agent kamu nulis 80 baris code buat yang sebenarnya cuma butuh 1 baris?',
    });
  });

  it('splits long Workers AI translation requests into safer chunks', async () => {
    const aiRun = vi
      .fn()
      .mockResolvedValueOnce({
        translated_text: '你的 AI 代理寫了 80 行程式碼。',
      })
      .mockResolvedValueOnce({
        translated_text: '認識 Ponytail 外掛。',
      });

    const response = await worker.fetch(
      createRequest('/v1/translate', {
        sourceUrl: 'https://x.com/alice/status/123',
        targetLanguage: 'zh-TW',
        text: `${'AI agent kamu nulis 80 baris code buat yang sebenarnya cuma butuh 1 baris? '.repeat(5).trim()}\n\nKenalan sama Ponytail plugin yang bikin AI coding agent berpikir seperti laziest senior dev di dunia.`,
      }),
      {
        ...env,
        AI: {
          run: aiRun,
        },
        TRANSLATE_PROVIDER: 'workers-ai',
      }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      provider: 'workers-ai',
      translatedText: '你的 AI 代理寫了 80 行程式碼。\n\n認識 Ponytail 外掛。',
    });
    expect(aiRun).toHaveBeenCalledTimes(2);
    expect(aiRun).toHaveBeenNthCalledWith(
      1,
      '@cf/meta/m2m100-1.2b',
      expect.objectContaining({
        source_lang: 'indonesian',
        target_lang: 'chinese',
      })
    );
  });

  it('preserves paragraph and list line breaks in Workers AI translations', async () => {
    const aiRun = vi
      .fn()
      .mockResolvedValueOnce({
        translated_text: '你的 AI 代理寫了 80 行程式碼，其實只需要 1 行？',
      })
      .mockResolvedValueOnce({
        translated_text: '運作方式：',
      })
      .mockResolvedValueOnce({
        translated_text: '1. 先檢查：這真的需要嗎？（YAGNI）',
      })
      .mockResolvedValueOnce({
        translated_text: '2. 標準函式庫裡有了嗎？',
      })
      .mockResolvedValueOnce({
        translated_text: '結果：',
      })
      .mockResolvedValueOnce({
        translated_text: '• 程式碼減少 80–94%',
      });

    const response = await worker.fetch(
      createRequest('/v1/translate', {
        sourceUrl: 'https://x.com/alice/status/123',
        targetLanguage: 'zh-TW',
        text: [
          'AI agent kamu nulis 80 baris code buat yang sebenarnya cuma butuh 1 baris?',
          '',
          'Cara kerjanya:',
          '1. Cek dulu: Apakah ini perlu? (YAGNI)',
          '2. Sudah ada di stdlib?',
          '',
          'Hasil benchmark:',
          '• 80–94% less code',
        ].join('\n'),
      }),
      {
        ...env,
        AI: {
          run: aiRun,
        },
        TRANSLATE_PROVIDER: 'workers-ai',
      }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      provider: 'workers-ai',
      translatedText: [
        '你的 AI 代理寫了 80 行程式碼，其實只需要 1 行？',
        '',
        '運作方式：',
        '1. 先檢查：這真的需要嗎？（YAGNI）',
        '2. 標準函式庫裡有了嗎？',
        '',
        '結果：',
        '• 程式碼減少 80–94%',
      ].join('\n'),
    });
    expect(aiRun).toHaveBeenCalledTimes(6);
  });

  it('keeps code-like chunks when Workers AI returns empty text', async () => {
    const aiRun = vi
      .fn()
      .mockResolvedValueOnce({
        translated_text: '範例：',
      })
      .mockResolvedValueOnce({
        translated_text: '',
      })
      .mockResolvedValueOnce({
        translated_text: '支援：Hermes、Codex',
      });

    const response = await worker.fetch(
      createRequest('/v1/translate', {
        sourceUrl: 'https://x.com/alice/status/123',
        targetLanguage: 'zh-TW',
        text: [
          'Contoh:',
          '✅ Ponytail: <input type="date"> <!-- ponytail: browser has one -->',
          '',
          'Support: Hermes, Codex',
        ].join('\n'),
      }),
      {
        ...env,
        AI: {
          run: aiRun,
        },
        TRANSLATE_PROVIDER: 'workers-ai',
      }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      provider: 'workers-ai',
      translatedText: [
        '範例：',
        '✅ Ponytail: <input type="date"> <!-- ponytail: browser has one -->',
        '',
        '支援：Hermes、Codex',
      ].join('\n'),
    });
  });

  it('proxies GIF requests to the configured GIF service', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          gifUrl: 'https://gif.example/artifacts/abc.gif',
          provider: 'render-gif',
          status: 'ready',
        }),
        { status: 200 }
      )
    );

    const response = await worker.fetch(
      createRequest('/v1/gif', {
        mediaUrl: 'https://cdn.example/video.mp4',
      }),
      env
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      gifUrl: 'https://gif.example/artifacts/abc.gif',
      provider: 'render-gif',
      status: 'ready',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://gif.example/v1/gif',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('rejects unauthorized requests when auth is configured', async () => {
    const response = await worker.fetch(
      new Request('https://discord-media-proxy.example/v1/preview', {
        body: JSON.stringify({ sourceUrl: 'https://x.com/alice/status/123' }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
      env
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });
});
