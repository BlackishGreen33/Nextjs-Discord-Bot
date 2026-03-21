export type GifMode = 'disabled' | 'remote';
export type MediaMode = 'disabled' | 'embedded' | 'remote';
export type StorageDriver = 'prisma' | 'redis';
export type TranslateProvider = 'disabled' | 'libretranslate';

const getTrimmedEnv = (name: string) => process.env[name]?.trim() ?? '';

const getValidEnvValue = <T extends readonly string[]>(
  name: string,
  allowed: T
): T[number] | null => {
  const value = getTrimmedEnv(name);

  return (allowed as readonly string[]).includes(value)
    ? (value as T[number])
    : null;
};

export const getDatabaseUrl = () => getTrimmedEnv('DATABASE_URL');

export const hasRedisStorageConfig = () =>
  Boolean(getTrimmedEnv('UPSTASH_REDIS_REST_URL')) &&
  Boolean(getTrimmedEnv('UPSTASH_REDIS_REST_TOKEN'));

export const getStorageDriver = (): StorageDriver => {
  const explicitDriver = getValidEnvValue('STORAGE_DRIVER', [
    'prisma',
    'redis',
  ] as const);

  if (explicitDriver) {
    return explicitDriver;
  }

  if (getDatabaseUrl()) {
    return 'prisma';
  }

  if (hasRedisStorageConfig()) {
    return 'redis';
  }

  return 'prisma';
};

export const getMediaServiceBaseUrl = () =>
  getTrimmedEnv('MEDIA_SERVICE_BASE_URL') ||
  getTrimmedEnv('MEDIA_WORKER_BASE_URL');

export const getMediaServiceToken = () =>
  getTrimmedEnv('MEDIA_SERVICE_TOKEN') || getTrimmedEnv('MEDIA_WORKER_TOKEN');

export const getMediaTimeoutMs = () => {
  const rawValue =
    getTrimmedEnv('MEDIA_TIMEOUT_MS') ||
    getTrimmedEnv('MEDIA_WORKER_TIMEOUT_MS');
  const timeout = Number(rawValue);

  return Number.isFinite(timeout) && timeout > 0 ? timeout : 8000;
};

export const getMediaMode = (): MediaMode => {
  const explicitMode = getValidEnvValue('MEDIA_MODE', [
    'disabled',
    'embedded',
    'remote',
  ] as const);

  if (explicitMode) {
    return explicitMode;
  }

  if (getMediaServiceBaseUrl()) {
    return 'remote';
  }

  return 'embedded';
};

export const hasRemoteMediaServiceConfig = () =>
  Boolean(getMediaServiceBaseUrl());

export const getGifServiceBaseUrl = () => getTrimmedEnv('GIF_SERVICE_BASE_URL');

export const getGifServiceToken = () => getTrimmedEnv('GIF_SERVICE_TOKEN');

export const getGifMode = (): GifMode => {
  const explicitMode = getValidEnvValue('GIF_MODE', [
    'disabled',
    'remote',
  ] as const);

  if (explicitMode) {
    return explicitMode;
  }

  return getGifServiceBaseUrl() ? 'remote' : 'disabled';
};

export const getTranslateProvider = (): TranslateProvider =>
  getValidEnvValue('TRANSLATE_PROVIDER', [
    'disabled',
    'libretranslate',
  ] as const) ?? 'disabled';

export const isTranslateFeatureAvailable = () => {
  if (getMediaMode() === 'remote') {
    return hasRemoteMediaServiceConfig();
  }

  return (
    getTranslateProvider() !== 'disabled' &&
    Boolean(getTrimmedEnv('TRANSLATE_API_BASE_URL'))
  );
};

export const isGifFeatureAvailable = () => {
  if (getMediaMode() === 'remote') {
    return hasRemoteMediaServiceConfig();
  }

  return getGifMode() === 'remote' && Boolean(getGifServiceBaseUrl());
};
