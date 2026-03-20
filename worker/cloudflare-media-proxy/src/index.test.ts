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
    vi.spyOn(globalThis, 'fetch')
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
