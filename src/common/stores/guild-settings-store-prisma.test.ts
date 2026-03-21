import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = {
  guildSettings: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
};

vi.mock('./prisma-client', () => ({
  getPrismaClient: () => prismaMock,
}));

import { createPrismaGuildSettingsStore } from './guild-settings-store-prisma';

describe('createPrismaGuildSettingsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merges partial prisma settings with defaults', async () => {
    prismaMock.guildSettings.findUnique.mockResolvedValueOnce({
      autoPreview: {
        features: {
          gif: false,
        },
        platforms: {
          pixiv: false,
        },
        translationTarget: 'ja',
      },
      guildId: 'guild-1',
      updatedAt: new Date('2026-03-20T00:00:00.000Z'),
      updatedBy: 'user-1',
    });

    const store = createPrismaGuildSettingsStore();

    await expect(store.get('guild-1')).resolves.toEqual({
      autoPreview: {
        enabled: true,
        features: {
          gif: false,
          translate: true,
        },
        nsfwMode: false,
        outputMode: 'embed',
        platforms: {
          bluesky: true,
          pixiv: false,
          twitter: true,
        },
        translationTarget: 'ja',
      },
      updatedAt: '2026-03-20T00:00:00.000Z',
      updatedBy: 'user-1',
    });
  });

  it('writes normalized settings through prisma upsert', async () => {
    prismaMock.guildSettings.upsert.mockResolvedValueOnce({});

    const store = createPrismaGuildSettingsStore();

    const saved = await store.set(
      'guild-1',
      {
        enabled: false,
        features: {
          gif: false,
          translate: true,
        },
        nsfwMode: true,
        outputMode: 'image',
        platforms: {
          bluesky: true,
          pixiv: false,
          twitter: true,
        },
        translationTarget: 'en',
      },
      'user-2'
    );

    expect(saved.autoPreview.outputMode).toBe('image');
    expect(prismaMock.guildSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          guildId: 'guild-1',
          updatedBy: 'user-2',
        }),
        where: {
          guildId: 'guild-1',
        },
      })
    );
  });
});
