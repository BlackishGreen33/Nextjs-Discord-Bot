import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(class {}),
}));

import { getPrismaClient } from './prisma-client';

describe('getPrismaClient', () => {
  beforeEach(() => {
    delete globalThis.__discordBotPrisma;
    vi.clearAllMocks();
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/discord_bot_test');
  });

  afterEach(() => {
    delete globalThis.__discordBotPrisma;
    vi.unstubAllEnvs();
  });

  it('constructs one client with a PostgreSQL adapter and reuses it', () => {
    const client = getPrismaClient();

    expect(getPrismaClient()).toBe(client);
    expect(PrismaClient).toHaveBeenCalledExactlyOnceWith({
      adapter: expect.any(PrismaPg),
    });
  });

  it('rejects a blank database URL before constructing a client', () => {
    vi.stubEnv('DATABASE_URL', '   ');

    expect(getPrismaClient).toThrow('DATABASE_URL');
    expect(PrismaClient).not.toHaveBeenCalled();
  });
});
