import { beforeEach, describe, expect, it, vi } from 'vitest';

const guildSettingsStoreMock = {
  get: vi.fn(),
  isAvailable: vi.fn(),
  set: vi.fn(),
};
const discordGetMock = vi.fn();

vi.mock('@/common/stores', () => ({
  getGuildSettingsStore: () => guildSettingsStoreMock,
}));

vi.mock('@/common/utils/discord-api', () => ({
  discord_api: {
    get: (...args: unknown[]) => discordGetMock(...args),
  },
}));

import { execute } from './settings';

const buildInteraction = (overrides?: {
  guildId?: string | null;
  permissions?: string;
}) =>
  ({
    guild_id:
      overrides && 'guildId' in overrides ? overrides.guildId : 'guild-1',
    member: {
      permissions: overrides?.permissions ?? String(1 << 3),
    },
  }) as Parameters<typeof execute>[0];

describe('/settings command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    guildSettingsStoreMock.isAvailable.mockReturnValue(true);
    discordGetMock.mockResolvedValue({
      data: {
        nick: '測試暱稱',
        user: {
          id: '290388314916388866',
          username: 'life_is_bg',
        },
      },
    });
    guildSettingsStoreMock.get.mockResolvedValue({
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
      updatedAt: '2026-03-19T00:00:00.000Z',
      updatedBy: '290388314916388866',
    });
  });

  it('rejects use outside guilds', async () => {
    const response = (await execute(buildInteraction({ guildId: null }))) as {
      data: { content: string; flags: number };
      type: number;
    };

    expect(response.type).toBe(4);
    expect(response.data.flags).toBe(64);
    expect(response.data.content).toContain('設定面板只能在伺服器內使用');
  });

  it('returns ephemeral error when settings storage is unavailable', async () => {
    guildSettingsStoreMock.isAvailable.mockReturnValue(false);

    const response = (await execute(buildInteraction())) as {
      data: { content: string; flags: number };
      type: number;
    };

    expect(response.data.flags).toBe(64);
    expect(response.data.content).toContain('尚未設定儲存層');
  });

  it('returns a visible panel for admins', async () => {
    const response = (await execute(buildInteraction())) as {
      data: {
        components: unknown[];
        embeds: Array<{ description?: string; title?: string }>;
        flags?: number;
      };
      type: number;
    };

    expect(response.type).toBe(4);
    expect(response.data.flags).toBeUndefined();
    expect(response.data.components).toHaveLength(1);
    expect(response.data.embeds[0]?.title).toContain('設定選單');
    expect(response.data.embeds[0]?.description).toContain(
      '首頁總覽只顯示目前狀態'
    );
    expect(JSON.stringify(response.data.embeds[0])).toContain(
      '測試暱稱 (290388314916388866)'
    );
  });

  it('returns view-only panel for non-admins', async () => {
    const response = (await execute(
      buildInteraction({ permissions: '0' })
    )) as {
      data: {
        components: Array<{ components: Array<{ disabled?: boolean }> }>;
        flags?: number;
      };
      type: number;
    };

    expect(response.data.flags).toBe(64);
    expect(response.data.components[0]?.components[0]?.disabled).toBe(false);
    expect(response.data.components).toHaveLength(1);
  });
});
