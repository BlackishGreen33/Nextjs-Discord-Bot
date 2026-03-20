const DEFAULT_REDIS_NAMESPACE = 'discord-bot';

type GuildAutoPreviewSettings = {
  enabled: boolean;
  features: {
    gif: boolean;
    translate: boolean;
  };
  nsfwMode: boolean;
  outputMode: 'embed' | 'image';
  platforms: {
    bluesky: boolean;
    pixiv: boolean;
    twitter: boolean;
  };
  translationTarget: string;
};

export type GuildSettings = {
  autoPreview: GuildAutoPreviewSettings;
  updatedAt: string;
  updatedBy: string;
};

export type GuildSettingsStore = {
  get: (guildId: string) => Promise<GuildSettings>;
  isAvailable: () => boolean;
  set: (
    guildId: string,
    settings: GuildSettings['autoPreview'],
    updatedBy: string
  ) => Promise<GuildSettings>;
};

export type GuildSettingsCommandRunner = <T>(
  command: string,
  ...args: Array<number | string>
) => Promise<T | null>;

type CreateGuildSettingsStoreOptions = {
  isAvailable?: () => boolean;
  namespace?: string;
  runCommand?: GuildSettingsCommandRunner;
};

type StoredGuildSettingsRecord = {
  autoPreview?: Partial<GuildAutoPreviewSettings> & {
    features?: Partial<GuildAutoPreviewSettings['features']>;
    platforms?: Partial<GuildAutoPreviewSettings['platforms']>;
  };
  updatedAt?: string;
  updatedBy?: string;
};

export const DEFAULT_GUILD_SETTINGS: GuildSettings = {
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
  updatedAt: '',
  updatedBy: '',
};

const buildSettingsKey = (namespace: string, guildId: string) =>
  `${namespace}:guild-settings:${guildId}`;

const normalizeNamespace = (value: string | undefined) => {
  const namespace = value?.trim();

  if (!namespace) {
    return DEFAULT_REDIS_NAMESPACE;
  }

  return namespace;
};

const ensureNonEmpty = (value: string, label: string) => {
  if (!value || value.trim().length === 0) {
    throw new Error(`${label} cannot be empty`);
  }
};

const hasUpstashConfig = () =>
  Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
  Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);

const defaultRunCommand: GuildSettingsCommandRunner = async <T>(
  command: string,
  ...args: Array<number | string>
) => {
  const baseUrl = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!baseUrl || !token) {
    throw new Error('Upstash Redis is not configured');
  }

  const encodedPath = [command, ...args.map((arg) => String(arg))]
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  const response = await fetch(`${baseUrl}/${encodedPath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(
      `Upstash command ${command} failed with status ${response.status}`
    );
  }

  const payload = (await response.json()) as { error?: string; result?: T };

  if (typeof payload.error === 'string' && payload.error.length > 0) {
    throw new Error(payload.error);
  }

  return (payload.result ?? null) as T | null;
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

const parseStoredSettings = (rawValue: string | null) => {
  if (!rawValue) {
    return DEFAULT_GUILD_SETTINGS;
  }

  try {
    return mergeWithDefaultSettings(
      JSON.parse(rawValue) as StoredGuildSettingsRecord
    );
  } catch {
    return DEFAULT_GUILD_SETTINGS;
  }
};

export const createGuildSettingsStore = (
  options: CreateGuildSettingsStoreOptions = {}
): GuildSettingsStore => {
  const namespace = normalizeNamespace(options.namespace);
  const runCommand = options.runCommand ?? defaultRunCommand;
  const isAvailable = options.isAvailable ?? hasUpstashConfig;

  const assertAvailable = () => {
    if (!isAvailable()) {
      throw new Error('Guild settings storage is not configured');
    }
  };

  return {
    async get(guildId) {
      ensureNonEmpty(guildId, 'guildId');
      assertAvailable();

      const key = buildSettingsKey(namespace, guildId);
      const rawValue = await runCommand<string | null>('get', key);

      return parseStoredSettings(rawValue);
    },

    isAvailable,

    async set(guildId, settings, updatedBy) {
      ensureNonEmpty(guildId, 'guildId');
      ensureNonEmpty(updatedBy, 'updatedBy');
      assertAvailable();

      const normalized = mergeWithDefaultSettings({
        autoPreview: settings,
        updatedAt: new Date().toISOString(),
        updatedBy,
      });

      const key = buildSettingsKey(namespace, guildId);

      await runCommand('set', key, JSON.stringify(normalized));

      return normalized;
    },
  };
};
