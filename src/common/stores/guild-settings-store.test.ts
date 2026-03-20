import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createGuildSettingsStore,
  DEFAULT_GUILD_SETTINGS,
} from './guild-settings-store';

describe('guild-settings-store', () => {
  const runCommand = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns defaults when no guild settings exist yet', async () => {
    runCommand.mockResolvedValueOnce(null);

    const store = createGuildSettingsStore({
      isAvailable: () => true,
      runCommand,
    });

    await expect(store.get('guild-1')).resolves.toEqual(DEFAULT_GUILD_SETTINGS);
    expect(runCommand).toHaveBeenCalledWith(
      'get',
      'discord-bot:guild-settings:guild-1'
    );
  });

  it('merges partial stored settings with defaults', async () => {
    runCommand.mockResolvedValueOnce(
      JSON.stringify({
        autoPreview: {
          features: {
            gif: false,
          },
          platforms: {
            pixiv: false,
          },
          translationTarget: 'ja',
        },
        updatedAt: '2026-03-19T00:00:00.000Z',
        updatedBy: 'user-1',
      })
    );

    const store = createGuildSettingsStore({
      isAvailable: () => true,
      runCommand,
    });

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
      updatedAt: '2026-03-19T00:00:00.000Z',
      updatedBy: 'user-1',
    });
  });

  it('writes normalized settings back to redis', async () => {
    runCommand.mockResolvedValueOnce('OK');

    const store = createGuildSettingsStore({
      isAvailable: () => true,
      runCommand,
    });

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
      'user-1'
    );

    expect(saved.autoPreview.outputMode).toBe('image');
    expect(saved.updatedBy).toBe('user-1');
    expect(runCommand).toHaveBeenCalledWith(
      'set',
      'discord-bot:guild-settings:guild-1',
      expect.stringContaining('"translationTarget":"en"')
    );
  });
});
