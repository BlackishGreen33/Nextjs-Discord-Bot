import { afterEach, describe, expect, it } from 'vitest';

import {
  getGifMode,
  getMediaMode,
  getStorageDriver,
  isGifFeatureAvailable,
  isTranslateFeatureAvailable,
} from './deployment';

const ENV_KEYS = [
  'DATABASE_URL',
  'GIF_MODE',
  'GIF_SERVICE_BASE_URL',
  'MEDIA_MODE',
  'MEDIA_SERVICE_BASE_URL',
  'MEDIA_WORKER_BASE_URL',
  'STORAGE_DRIVER',
  'TRANSLATE_API_BASE_URL',
  'TRANSLATE_PROVIDER',
  'UPSTASH_REDIS_REST_TOKEN',
  'UPSTASH_REDIS_REST_URL',
] as const;

const originalValues = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]])
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

const resetEnv = () => {
  const mutableEnv = process.env as Record<string, string | undefined>;

  for (const key of ENV_KEYS) {
    if (originalValues[key] === undefined) {
      delete mutableEnv[key];
      continue;
    }

    mutableEnv[key] = originalValues[key];
  }
};

describe('deployment config helpers', () => {
  afterEach(() => {
    resetEnv();
  });

  it('prefers prisma storage when DATABASE_URL is present', () => {
    process.env.DATABASE_URL = 'postgres://db.example/app';
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    expect(getStorageDriver()).toBe('prisma');
  });

  it('falls back to redis storage for legacy Upstash-only setups', () => {
    delete process.env.DATABASE_URL;
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'redis-token';

    expect(getStorageDriver()).toBe('redis');
  });

  it('auto-detects remote media mode from legacy worker env', () => {
    delete process.env.MEDIA_MODE;
    process.env.MEDIA_WORKER_BASE_URL = 'https://worker.example';

    expect(getMediaMode()).toBe('remote');
  });

  it('defaults media mode to embedded when no remote service is configured', () => {
    delete process.env.MEDIA_MODE;
    delete process.env.MEDIA_SERVICE_BASE_URL;
    delete process.env.MEDIA_WORKER_BASE_URL;

    expect(getMediaMode()).toBe('embedded');
  });

  it('treats translate as available when embedded provider env is configured', () => {
    process.env.MEDIA_MODE = 'embedded';
    process.env.TRANSLATE_PROVIDER = 'libretranslate';
    process.env.TRANSLATE_API_BASE_URL = 'https://translate.example';

    expect(isTranslateFeatureAvailable()).toBe(true);
  });

  it('treats gif as available only when remote gif service is configured in embedded mode', () => {
    process.env.MEDIA_MODE = 'embedded';
    process.env.GIF_MODE = 'remote';
    process.env.GIF_SERVICE_BASE_URL = 'https://gif.example';

    expect(getGifMode()).toBe('remote');
    expect(isGifFeatureAvailable()).toBe(true);
  });
});
