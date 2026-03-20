import { AttachmentBuilder } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildPreviewFiles } from './preview-attachments.mjs';

const basePreview = {
  media: [
    {
      altText: null,
      gifConvertible: false,
      previewUrl: 'https://cdn.example/thumb.jpg',
      sourceUrl: 'https://cdn.example/media.mp4',
      type: 'video' as const,
    },
  ],
  platform: 'Twitter',
  sensitive: false,
};

const baseSettings = {
  autoPreview: {
    nsfwMode: false,
    outputMode: 'image',
  },
};

describe('buildPreviewFiles', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns uploaded attachment builders for renderable media', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(Uint8Array.from([1, 2, 3, 4]), {
        headers: {
          'content-type': 'video/mp4',
        },
        status: 200,
      })
    );

    const files = await buildPreviewFiles(
      basePreview,
      baseSettings,
      {} as NodeJS.ProcessEnv,
      fetchMock
    );

    expect(fetchMock).toHaveBeenCalledWith('https://cdn.example/media.mp4', {
      redirect: 'follow',
      signal: expect.any(AbortSignal),
    });
    expect(files).toHaveLength(1);
    expect(files[0]).toBeInstanceOf(AttachmentBuilder);
    expect(files[0].name).toBe('twitter-1.mp4');
  });

  it('skips media that exceed the configured size limit', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(Uint8Array.from([1, 2, 3, 4, 5]), {
        headers: {
          'content-length': '5',
          'content-type': 'image/png',
        },
        status: 200,
      })
    );

    const files = await buildPreviewFiles(
      {
        ...basePreview,
        media: [
          {
            ...basePreview.media[0],
            sourceUrl: 'https://cdn.example/image.png',
            type: 'image',
          },
        ],
      },
      baseSettings,
      {
        GATEWAY_ATTACHMENT_MAX_BYTES: '4',
        NODE_ENV: 'test',
      } as NodeJS.ProcessEnv,
      fetchMock
    );

    expect(files).toEqual([]);
  });

  it('skips media when the response is not renderable media', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('not media', {
        headers: {
          'content-type': 'text/html',
        },
        status: 200,
      })
    );

    const files = await buildPreviewFiles(
      basePreview,
      baseSettings,
      {} as NodeJS.ProcessEnv,
      fetchMock
    );

    expect(files).toEqual([]);
  });

  it('skips sensitive media when nsfw mode is disabled', async () => {
    const fetchMock = vi.fn();

    const files = await buildPreviewFiles(
      {
        ...basePreview,
        sensitive: true,
      },
      baseSettings,
      {} as NodeJS.ProcessEnv,
      fetchMock
    );

    expect(files).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
