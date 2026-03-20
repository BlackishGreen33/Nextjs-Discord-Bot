import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const discordDeleteMock = vi.fn();
const discordPostMock = vi.fn();
const getMediaPreviewMock = vi.fn();
const translateMediaTextMock = vi.fn();
const createMediaGifMock = vi.fn();
const guildSettingsStoreMock = {
  get: vi.fn(),
  isAvailable: vi.fn(),
  set: vi.fn(),
};

vi.mock('@/common/stores', () => ({
  DEFAULT_GUILD_SETTINGS: {
    autoPreview: {
      enabled: true,
      features: {
        gif: true,
        translate: true,
      },
      nsfwMode: false,
      outputMode: 'embed',
      platforms: {
        bluesky: true,
        pixiv: true,
        twitter: true,
      },
      translationTarget: 'zh-TW',
    },
    updatedAt: '1970-01-01T00:00:00.000Z',
    updatedBy: 'system',
  },
  getGuildSettingsStore: () => guildSettingsStoreMock,
}));

vi.mock('./discord-api', () => ({
  discord_api: {
    delete: (...args: unknown[]) => discordDeleteMock(...args),
    post: (...args: unknown[]) => discordPostMock(...args),
  },
}));

vi.mock('./media-worker', () => ({
  createMediaGif: (...args: unknown[]) => createMediaGifMock(...args),
  getMediaPreview: (...args: unknown[]) => getMediaPreviewMock(...args),
  translateMediaText: (...args: unknown[]) => translateMediaTextMock(...args),
}));

import { handleMediaComponentInteraction } from './media-component-handler';
import { buildPreviewActionCustomId } from './media-link';

const baseSettings = {
  autoPreview: {
    enabled: true,
    features: {
      gif: true,
      translate: true,
    },
    nsfwMode: false,
    outputMode: 'embed' as const,
    platforms: {
      bluesky: true,
      pixiv: true,
      twitter: true,
    },
    translationTarget: 'zh-TW',
  },
  updatedAt: '2026-03-19T00:00:00.000Z',
  updatedBy: 'system',
};

const buildInteraction = (customId: string) =>
  ({
    channel_id: 'channel-1',
    data: {
      component_type: 2,
      custom_id: customId,
    },
    guild_id: 'guild-1',
    member: {
      nick: '測試暱稱',
      permissions: String(1 << 3),
      user: {
        username: 'life_is_bg',
        id: 'user-1',
      },
    },
    message: {
      content: 'https://x.com/user/status/1',
      embeds: [
        {
          url: 'https://x.com/user/status/1',
        },
      ],
      id: 'bot-message-1',
    },
  }) as Parameters<typeof handleMediaComponentInteraction>[0];

describe('media-component-handler', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    guildSettingsStoreMock.isAvailable.mockReturnValue(true);
    guildSettingsStoreMock.get.mockResolvedValue(baseSettings);
    guildSettingsStoreMock.set.mockImplementation(
      async (_guildId, nextValue, updatedBy) => ({
        autoPreview: nextValue,
        updatedAt: '2026-03-19T01:00:00.000Z',
        updatedBy,
      })
    );
    getMediaPreviewMock.mockResolvedValue({
      authorAvatarUrl: null,
      authorHandle: '@alice',
      authorName: 'Alice',
      canonicalUrl: 'https://x.com/user/status/1',
      likes: 3,
      media: [
        {
          gifConvertible: true,
          previewUrl: 'https://cdn.example/thumb.jpg',
          sourceUrl: 'https://cdn.example/video.mp4',
          type: 'video',
        },
      ],
      platform: 'Twitter',
      publishedAt: '2026-03-19T00:00:00.000Z',
      replies: 1,
      reposts: 2,
      sensitive: false,
      sourceUrl: 'https://x.com/user/status/1',
      text: 'Hello world',
      title: 'Hello world',
      translatedText: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('updates the preview message when translation succeeds', async () => {
    translateMediaTextMock.mockResolvedValue({
      provider: 'translate-api',
      translatedText: '你好世界',
    });

    const response = await handleMediaComponentInteraction(
      buildInteraction(
        buildPreviewActionCustomId('translate', 'user-1', 'src-1')
      )
    );

    expect(response.type).toBe(7);
    expect(
      (response as { data: { embeds: Array<{ description?: string }> } }).data
        .embeds[0]?.description
    ).toContain('翻譯 (zh-TW)');
  });

  it('queues a background GIF follow-up when conversion is slow', async () => {
    vi.useFakeTimers();
    createMediaGifMock.mockReturnValue(new Promise(() => {}));
    const scheduleBackgroundTask = vi.fn();

    const responsePromise = handleMediaComponentInteraction(
      buildInteraction(buildPreviewActionCustomId('gif', 'user-1', 'src-1')),
      { scheduleBackgroundTask }
    );

    await vi.advanceTimersByTimeAsync(2801);
    const response = (await responsePromise) as {
      data: { content: string; flags: number };
      type: number;
    };

    expect(response.type).toBe(4);
    expect(response.data.flags).toBe(64);
    expect(response.data.content).toContain('GIF 仍在處理中');
    expect(scheduleBackgroundTask).toHaveBeenCalledTimes(1);
  });

  it('deletes the preview message when retract is authorized', async () => {
    discordDeleteMock.mockResolvedValue({});

    const response = await handleMediaComponentInteraction(
      buildInteraction(buildPreviewActionCustomId('retract', 'user-1', 'src-1'))
    );

    expect(discordDeleteMock).toHaveBeenCalledWith(
      '/channels/channel-1/messages/bot-message-1'
    );
    expect(response.type).toBe(6);
  });

  it('toggles guild settings from the settings panel', async () => {
    const response = await handleMediaComponentInteraction({
      ...buildInteraction('st:v1:toggle-enabled'),
      data: {
        component_type: 2,
        custom_id: 'st:v2:toggle-enabled:service',
      },
      message: {
        id: 'settings-message',
      },
    });

    expect(guildSettingsStoreMock.set).toHaveBeenCalledWith(
      'guild-1',
      expect.objectContaining({
        enabled: false,
      }),
      '測試暱稱 (user-1)'
    );
    expect(response.type).toBe(7);
  });
});
