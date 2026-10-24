import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { getDatabaseUrl } from '../configs/deployment';

declare global {
  var __discordBotPrisma: PrismaClient | undefined;
}

export const getPrismaClient = () => {
  if (!globalThis.__discordBotPrisma) {
    const connectionString = getDatabaseUrl();
    if (!connectionString) {
      throw new Error('DATABASE_URL is required for Prisma storage');
    }

    const adapter = new PrismaPg({
      connectionString,
      connectionTimeoutMillis: 5_000,
    });
    globalThis.__discordBotPrisma = new PrismaClient({ adapter });
  }

  return globalThis.__discordBotPrisma;
};
