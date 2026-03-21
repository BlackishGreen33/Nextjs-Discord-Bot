import type { GuildSettings, GuildSettingsStore } from './guild-settings-store';
import { DEFAULT_GUILD_SETTINGS } from './guild-settings-store';
import { getPrismaClient } from './prisma-client';

type StoredGuildSettingsRecord = {
  autoPreview?: Partial<GuildSettings['autoPreview']> & {
    features?: Partial<GuildSettings['autoPreview']['features']>;
    platforms?: Partial<GuildSettings['autoPreview']['platforms']>;
  };
  updatedAt?: string;
  updatedBy?: string;
};

const hasDatabaseUrl = () => Boolean(process.env.DATABASE_URL?.trim());

const ensureNonEmpty = (value: string, label: string) => {
  if (!value || value.trim().length === 0) {
    throw new Error(`${label} cannot be empty`);
  }
};

const normalizeTranslationTarget = (value: unknown) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return DEFAULT_GUILD_SETTINGS.autoPreview.translationTarget;
  }

  return value.trim().slice(0, 16);
};

const normalizeOutputMode = (value: unknown): 'embed' | 'image' =>
  value === 'image' ? 'image' : 'embed';

const mergeWithDefaultSettings = (
  stored: StoredGuildSettingsRecord | null | undefined
): GuildSettings => ({
  autoPreview: {
    enabled:
      typeof stored?.autoPreview?.enabled === 'boolean'
        ? stored.autoPreview.enabled
        : DEFAULT_GUILD_SETTINGS.autoPreview.enabled,
    features: {
      gif:
        typeof stored?.autoPreview?.features?.gif === 'boolean'
          ? stored.autoPreview.features.gif
          : DEFAULT_GUILD_SETTINGS.autoPreview.features.gif,
      translate:
        typeof stored?.autoPreview?.features?.translate === 'boolean'
          ? stored.autoPreview.features.translate
          : DEFAULT_GUILD_SETTINGS.autoPreview.features.translate,
    },
    nsfwMode:
      typeof stored?.autoPreview?.nsfwMode === 'boolean'
        ? stored.autoPreview.nsfwMode
        : DEFAULT_GUILD_SETTINGS.autoPreview.nsfwMode,
    outputMode: normalizeOutputMode(stored?.autoPreview?.outputMode),
    platforms: {
      bluesky:
        typeof stored?.autoPreview?.platforms?.bluesky === 'boolean'
          ? stored.autoPreview.platforms.bluesky
          : DEFAULT_GUILD_SETTINGS.autoPreview.platforms.bluesky,
      pixiv:
        typeof stored?.autoPreview?.platforms?.pixiv === 'boolean'
          ? stored.autoPreview.platforms.pixiv
          : DEFAULT_GUILD_SETTINGS.autoPreview.platforms.pixiv,
      twitter:
        typeof stored?.autoPreview?.platforms?.twitter === 'boolean'
          ? stored.autoPreview.platforms.twitter
          : DEFAULT_GUILD_SETTINGS.autoPreview.platforms.twitter,
    },
    translationTarget: normalizeTranslationTarget(
      stored?.autoPreview?.translationTarget
    ),
  },
  updatedAt:
    typeof stored?.updatedAt === 'string'
      ? stored.updatedAt
      : DEFAULT_GUILD_SETTINGS.updatedAt,
  updatedBy:
    typeof stored?.updatedBy === 'string'
      ? stored.updatedBy
      : DEFAULT_GUILD_SETTINGS.updatedBy,
});

export const createPrismaGuildSettingsStore = (): GuildSettingsStore => ({
  async get(guildId) {
    ensureNonEmpty(guildId, 'guildId');

    const prisma = getPrismaClient();
    const record = await prisma.guildSettings.findUnique({
      where: {
        guildId,
      },
    });

    if (!record) {
      return DEFAULT_GUILD_SETTINGS;
    }

    return mergeWithDefaultSettings({
      autoPreview:
        record.autoPreview && typeof record.autoPreview === 'object'
          ? (record.autoPreview as StoredGuildSettingsRecord['autoPreview'])
          : undefined,
      updatedAt: record.updatedAt.toISOString(),
      updatedBy: record.updatedBy,
    });
  },

  isAvailable: hasDatabaseUrl,

  async set(guildId, settings, updatedBy) {
    ensureNonEmpty(guildId, 'guildId');
    ensureNonEmpty(updatedBy, 'updatedBy');

    const normalized = mergeWithDefaultSettings({
      autoPreview: settings,
      updatedAt: new Date().toISOString(),
      updatedBy,
    });
    const prisma = getPrismaClient();

    await prisma.guildSettings.upsert({
      create: {
        autoPreview: normalized.autoPreview,
        guildId,
        updatedAt: new Date(normalized.updatedAt),
        updatedBy: normalized.updatedBy,
      },
      update: {
        autoPreview: normalized.autoPreview,
        updatedAt: new Date(normalized.updatedAt),
        updatedBy: normalized.updatedBy,
      },
      where: {
        guildId,
      },
    });

    return normalized;
  },
});
