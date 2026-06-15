import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GuildSettings } from '@/common/stores';

import type { MediaPreview } from './media-types';
import { buildPreviewMessagePayload } from './preview-card';

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
  updatedAt: '2026-06-15T00:00:00.000Z',
  updatedBy: 'system',
} satisfies GuildSettings;

const basePreview = {
  authorAvatarUrl:
    'https://pbs.twimg.com/profile_images/2055927919185371136/C-0onJ_K_200x200.jpg',
  authorHandle: '@bryanonchain',
  authorName: 'Bryan',
  canonicalUrl: 'https://x.com/bryanonchain/status/2065722260586103147',
  likes: 1373,
  media: [
    {
      altText: null,
      gifConvertible: true,
      previewUrl: 'https://pbs.twimg.com/media/example.jpg',
      sourceUrl: 'https://video.twimg.com/example.mp4',
      type: 'video',
    },
  ],
  platform: 'Twitter',
  publishedAt: '2026-06-13T09:05:00.000Z',
  replies: 31,
  reposts: 177,
  sensitive: false,
  sourceUrl: 'https://x.com/i/status/2065722260586103147',
  text: [
    'AI agent kamu nulis 80 baris code buat yang sebenarnya cuma butuh 1 baris?',
    '',
    'Cara kerjanya:',
    '1. Cek dulu: Apakah ini perlu? (YAGNI)',
    '2. Sudah ada di stdlib?',
  ].join('\n'),
  title:
    'AI agent kamu nulis 80 baris code buat yang sebenarnya cuma butuh 1 baris?',
  translatedText: null,
} satisfies MediaPreview;

const ENV_KEYS = [
  'GIF_SERVICE_BASE_URL',
  'GIF_MODE',
  'TRANSLATE_API_BASE_URL',
  'TRANSLATE_PROVIDER',
] as const;
const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]])
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

const configureAvailableFeatures = () => {
  process.env.GIF_MODE = 'remote';
  process.env.GIF_SERVICE_BASE_URL = 'https://gif.example';
  process.env.TRANSLATE_PROVIDER = 'libretranslate';
  process.env.TRANSLATE_API_BASE_URL = 'https://translate.example';
};

describe('buildPreviewMessagePayload', () => {
  afterEach(() => {
    vi.unstubAllGlobals();

    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
        continue;
      }

      process.env[key] = originalEnv[key];
    }
  });

  it('builds a Tendou-style Twitter preview card', () => {
    configureAvailableFeatures();

    const payload = buildPreviewMessagePayload(basePreview, baseSettings, {
      ownerUserId: 'user-1',
      sourceMessageId: 'message-1',
    });

    expect(payload.embeds).toHaveLength(1);
    expect(payload.embeds[0]).toMatchObject({
      author: {
        icon_url:
          'https://pbs.twimg.com/profile_images/2055927919185371136/C-0onJ_K_normal.jpg',
        name: 'Twitter',
        url: 'https://twitter.com/bryanonchain',
      },
      color: 0x0099ff,
      description: basePreview.text,
      fields: [
        {
          inline: true,
          name: '回覆',
          value: '31',
        },
        {
          inline: true,
          name: '轉推',
          value: '177',
        },
        {
          inline: true,
          name: '喜歡',
          value: '1373',
        },
      ],
      image: {
        url: basePreview.media[0].previewUrl,
      },
      title: 'Bryan (@bryanonchain)',
      timestamp: basePreview.publishedAt,
      url: 'https://twitter.com/bryanonchain/status/2065722260586103147',
    });
    expect(payload.embeds[0]?.footer).toEqual({
      icon_url:
        'https://cdn.discordapp.com/emojis/1171098831023251477.webp?size=128&quality=lossless',
      text: '發文時間',
    });
    expect(payload.components[0]?.components).toEqual([
      expect.objectContaining({
        emoji: { name: '🗑️' },
      }),
      expect.objectContaining({
        disabled: false,
        emoji: { name: '🌐' },
      }),
      expect.objectContaining({
        emoji: { name: '🎬' },
      }),
    ]);
  });

  it('keeps translated text in a full-width embed field', () => {
    configureAvailableFeatures();

    const payload = buildPreviewMessagePayload(
      {
        ...basePreview,
        translatedText: [
          '你的 AI 代理寫了 80 行程式碼，其實只需要 1 行？',
          '',
          '運作方式：',
          '1. 先檢查：這真的需要嗎？（YAGNI）',
          '2. 標準函式庫裡有了嗎？',
        ].join('\n'),
      },
      baseSettings,
      {
        ownerUserId: 'user-1',
        sourceMessageId: 'message-1',
      }
    );

    expect(payload.embeds).toHaveLength(1);
    expect(payload.embeds[0]?.description).toBe(basePreview.text);
    expect(payload.embeds[0]?.description).not.toContain(
      '你的 AI 代理寫了 80 行程式碼'
    );
    expect(payload.embeds[0]?.fields?.[3]).toEqual({
      inline: false,
      name: '\u200B',
      value: [
        '你的 AI 代理寫了 80 行程式碼，其實只需要 1 行？',
        '',
        '運作方式：',
        '1. 先檢查：這真的需要嗎？（YAGNI）',
        '2. 標準函式庫裡有了嗎？',
      ].join('\n'),
    });
    expect(payload.components[0]?.components[1]).toEqual(
      expect.objectContaining({
        disabled: true,
        emoji: { name: '🌐' },
      })
    );
  });
});
