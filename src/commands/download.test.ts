import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMediaPreviewMock = vi.fn();
const normalizeMediaUrlMock = vi.fn();

vi.mock('@/common/utils', () => ({
  buildMediaButtonCustomId: (action: string, ownerUserId: string) =>
    `dl:v1:${action}:${ownerUserId}`,
  getMediaPreview: (...args: unknown[]) => getMediaPreviewMock(...args),
  normalizeMediaUrl: (...args: unknown[]) => normalizeMediaUrlMock(...args),
}));

import { execute } from './download';

const asMessage = (response: Awaited<ReturnType<typeof execute>>) =>
  response as {
    data: {
      components?: Array<{
        components: Array<{ custom_id: string; label: string }>;
      }>;
      content?: string;
      embeds?: Array<{
        author?: { name?: string };
        description?: string;
        url?: string;
      }>;
      flags?: number;
    };
    type: number;
  };

const buildInteraction = (url?: string) =>
  ({
    data: {
      name: 'download',
      options: url
        ? [
            {
              name: 'url',
              type: 3,
              value: url,
            },
          ]
        : [],
    },
    member: {
      user: {
        id: 'owner-1',
      },
    },
    user: {
      id: 'user-1',
    },
  }) as Parameters<typeof execute>[0];

describe('/download command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ephemeral message for unsupported URL', async () => {
    normalizeMediaUrlMock.mockReturnValue(null);

    const response = asMessage(await execute(buildInteraction('invalid-url')));

    expect(response.type).toBe(4);
    expect(response.data.flags).toBe(64);
    expect(response.data.content).toContain('Unsupported URL');
  });

  it('returns preview card with media action buttons', async () => {
    normalizeMediaUrlMock.mockReturnValue('https://x.com/example/status/1');
    getMediaPreviewMock.mockResolvedValue({
      authorHandle: '@example',
      authorName: 'Example Author',
      likes: 30,
      platform: 'Twitter',
      publishedAt: '2026-03-04T10:00:00.000Z',
      replies: 3,
      reposts: 20,
      sourceUrl: 'https://x.com/example/status/1',
      text: 'tweet text',
      thumbnailUrl: 'https://cdn.example/image.jpg',
      title: 'Post title',
    });

    const response = asMessage(
      await execute(buildInteraction('https://x.com/example/status/1'))
    );

    expect(response.type).toBe(4);
    expect(response.data.flags).toBeUndefined();
    expect(response.data.content).toBe('https://x.com/example/status/1');
    expect(response.data.embeds?.[0]?.url).toBe(
      'https://x.com/example/status/1'
    );
    expect(response.data.embeds?.[0]?.author?.name).toContain('Twitter');
    expect(response.data.components?.[0]?.components).toHaveLength(3);
    expect(response.data.components?.[0]?.components[0]?.label).toBe(
      'Download Video'
    );
    expect(response.data.components?.[0]?.components[2]?.custom_id).toBe(
      'dl:v1:delete:owner-1'
    );
  });

  it('returns ephemeral error when preview fetch fails', async () => {
    normalizeMediaUrlMock.mockReturnValue('https://x.com/example/status/1');
    getMediaPreviewMock.mockRejectedValue(new Error('service down'));

    const response = asMessage(
      await execute(buildInteraction('https://x.com/example/status/1'))
    );

    expect(response.data.flags).toBe(64);
    expect(response.data.content).toContain('Failed to fetch media preview');
  });
});
