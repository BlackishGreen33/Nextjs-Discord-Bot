import { beforeEach, describe, expect, it, vi } from 'vitest';

const createMediaDownloadMock = vi.fn();

vi.mock('./media-worker', () => ({
  createMediaDownload: (...args: unknown[]) => createMediaDownloadMock(...args),
}));

import { handleMediaButtonInteraction } from './media-component-handler';

const asMessage = (
  response: Awaited<ReturnType<typeof handleMediaButtonInteraction>>
) =>
  response as {
    data: { components?: unknown[]; content?: string; flags?: number };
    type: number;
  };

const baseInteraction = () => ({
  channel_id: 'channel-1',
  data: {
    component_type: 2,
    custom_id: 'dl:v1:video:owner-1',
  },
  guild_id: 'guild-1',
  member: {
    permissions: '0',
    user: {
      id: 'owner-1',
    },
  },
  message: {
    content: 'https://x.com/example/status/1',
    embeds: [
      {
        url: 'https://x.com/example/status/1',
      },
    ],
  },
  user: {
    id: 'owner-1',
  },
});

describe('handleMediaButtonInteraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unsupported action ids', async () => {
    const interaction = baseInteraction();
    interaction.data.custom_id = 'invalid-id';

    const response = asMessage(await handleMediaButtonInteraction(interaction));

    expect(response.type).toBe(4);
    expect(response.data.flags).toBe(64);
    expect(response.data.content).toContain('Unsupported action id');
  });

  it('blocks delete for non-owner without permissions', async () => {
    const interaction = baseInteraction();
    interaction.data.custom_id = 'dl:v1:delete:owner-1';
    interaction.member.user.id = 'other-user';
    interaction.user.id = 'other-user';

    const response = asMessage(await handleMediaButtonInteraction(interaction));

    expect(response.type).toBe(4);
    expect(response.data.flags).toBe(64);
    expect(response.data.content).toContain('Only the requester or admins');
  });

  it('updates message when owner clicks delete', async () => {
    const interaction = baseInteraction();
    interaction.data.custom_id = 'dl:v1:delete:owner-1';

    const response = asMessage(await handleMediaButtonInteraction(interaction));

    expect(response.type).toBe(7);
    expect(response.data.content).toContain('removed');
    expect(response.data.components).toEqual([]);
  });

  it('returns public message when media download is ready', async () => {
    createMediaDownloadMock.mockResolvedValue({
      expiresAt: '2026-03-04T12:00:00.000Z',
      filename: 'clip.mp4',
      mediaUrl: 'https://download.example/media.mp4',
      message: null,
      provider: 'cobalt',
      status: 'ready',
    });

    const response = asMessage(
      await handleMediaButtonInteraction(baseInteraction())
    );

    expect(response.type).toBe(4);
    expect(response.data.flags).toBeUndefined();
    expect(response.data.content).toContain(
      'https://download.example/media.mp4'
    );
    expect(response.data.content).toContain('Provider: cobalt');
  });
});
