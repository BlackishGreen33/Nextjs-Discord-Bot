import { PrismaClient } from '@prisma/client';

declare global {
  var __discordBotPrisma: PrismaClient | undefined;
}

export const getPrismaClient = () => {
  if (!globalThis.__discordBotPrisma) {
    globalThis.__discordBotPrisma = new PrismaClient();
  }

  return globalThis.__discordBotPrisma;
};
