const DEFAULT_REDIS_NAMESPACE = 'discord-bot';
const FAQ_INDEX_SUFFIX = 'keys';

export type FaqEntry = {
  answer: string;
  key: string;
  updatedAt: string;
  updatedBy: string;
};

export type FaqStore = {
  isAvailable: () => boolean;
  get: (guildId: string, faqKey: string) => Promise<FaqEntry | null>;
  set: (
    guildId: string,
    faqKey: string,
    answer: string,
    updatedBy: string
  ) => Promise<void>;
  delete: (guildId: string, faqKey: string) => Promise<boolean>;
  listKeys: (guildId: string) => Promise<string[]>;
};

type CreateFaqStoreOptions = {
  isAvailable?: () => boolean;
  namespace?: string;
  runCommand?: FaqCommandRunner;
};

type FaqRecord = {
  answer: string;
  updatedAt: string;
  updatedBy: string;
};

export type FaqCommandRunner = <T>(
  command: string,
  ...args: Array<number | string>
) => Promise<T | null>;

const buildEntryKey = (namespace: string, guildId: string, faqKey: string) =>
  `${namespace}:faq:${guildId}:${faqKey}`;

const buildIndexKey = (namespace: string, guildId: string) =>
  `${namespace}:faq:${guildId}:${FAQ_INDEX_SUFFIX}`;

const parseFaqRecord = (
  faqKey: string,
  rawValue: string | null
): FaqEntry | null => {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<FaqRecord>;

    if (typeof parsed.answer !== 'string') {
      return null;
    }

    return {
      answer: parsed.answer,
      key: faqKey,
      updatedAt:
        typeof parsed.updatedAt === 'string'
          ? parsed.updatedAt
          : new Date(0).toISOString(),
      updatedBy:
        typeof parsed.updatedBy === 'string' ? parsed.updatedBy : 'unknown',
    };
  } catch {
    return null;
  }
};

const normalizeNamespace = (value: string | undefined) => {
  const namespace = value?.trim();

  if (!namespace) {
    return DEFAULT_REDIS_NAMESPACE;
  }

  return namespace;
};

const hasUpstashConfig = () =>
  Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
  Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);

const defaultRunCommand: FaqCommandRunner = async <T>(
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

const ensureNonEmpty = (value: string, label: string) => {
  if (!value || value.trim().length === 0) {
    throw new Error(`${label} cannot be empty`);
  }
};

export const createFaqStore = (
  options: CreateFaqStoreOptions = {}
): FaqStore => {
  const namespace = normalizeNamespace(options.namespace);
  const runCommand = options.runCommand ?? defaultRunCommand;
  const isAvailable = options.isAvailable ?? hasUpstashConfig;

  const assertAvailable = () => {
    if (!isAvailable()) {
      throw new Error('FAQ storage is not configured');
    }
  };

  return {
    async delete(guildId, faqKey) {
      ensureNonEmpty(guildId, 'guildId');
      ensureNonEmpty(faqKey, 'faqKey');
      assertAvailable();

      const entryKey = buildEntryKey(namespace, guildId, faqKey);
      const indexKey = buildIndexKey(namespace, guildId);

      const deletedCount = await runCommand<number | string>('del', entryKey);
      await runCommand('srem', indexKey, faqKey);

      return Number(deletedCount ?? 0) > 0;
    },

    async get(guildId, faqKey) {
      ensureNonEmpty(guildId, 'guildId');
      ensureNonEmpty(faqKey, 'faqKey');
      assertAvailable();

      const entryKey = buildEntryKey(namespace, guildId, faqKey);
      const record = await runCommand<string | null>('get', entryKey);

      return parseFaqRecord(faqKey, record);
    },

    isAvailable,

    async listKeys(guildId) {
      ensureNonEmpty(guildId, 'guildId');
      assertAvailable();

      const indexKey = buildIndexKey(namespace, guildId);
      const keys = await runCommand<Array<string | null> | null>(
        'smembers',
        indexKey
      );

      if (!Array.isArray(keys)) {
        return [];
      }

      return keys
        .filter((value): value is string => typeof value === 'string')
        .sort((left, right) => left.localeCompare(right));
    },

    async set(guildId, faqKey, answer, updatedBy) {
      ensureNonEmpty(guildId, 'guildId');
      ensureNonEmpty(faqKey, 'faqKey');
      ensureNonEmpty(answer, 'answer');
      assertAvailable();

      const entryKey = buildEntryKey(namespace, guildId, faqKey);
      const indexKey = buildIndexKey(namespace, guildId);
      const now = new Date().toISOString();

      const record: FaqRecord = {
        answer,
        updatedAt: now,
        updatedBy,
      };

      await runCommand('set', entryKey, JSON.stringify(record));
      await runCommand('sadd', indexKey, faqKey);
    },
  };
};
