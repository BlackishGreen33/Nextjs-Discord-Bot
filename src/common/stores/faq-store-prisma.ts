import type { FaqStore } from './faq-store';
import { getPrismaClient } from './prisma-client';

const hasDatabaseUrl = () => Boolean(process.env.DATABASE_URL?.trim());

const ensureNonEmpty = (value: string, label: string) => {
  if (!value || value.trim().length === 0) {
    throw new Error(`${label} cannot be empty`);
  }
};

export const createPrismaFaqStore = (): FaqStore => ({
  async delete(guildId, faqKey) {
    ensureNonEmpty(guildId, 'guildId');
    ensureNonEmpty(faqKey, 'faqKey');

    const prisma = getPrismaClient();
    const deleted = await prisma.faqEntry.deleteMany({
      where: {
        guildId,
        key: faqKey,
      },
    });

    return deleted.count > 0;
  },

  async get(guildId, faqKey) {
    ensureNonEmpty(guildId, 'guildId');
    ensureNonEmpty(faqKey, 'faqKey');

    const prisma = getPrismaClient();
    const entry = await prisma.faqEntry.findUnique({
      where: {
        guildId_key: {
          guildId,
          key: faqKey,
        },
      },
    });

    if (!entry) {
      return null;
    }

    return {
      answer: entry.answer,
      key: faqKey,
      updatedAt: entry.updatedAt.toISOString(),
      updatedBy: entry.updatedBy,
    };
  },

  isAvailable: hasDatabaseUrl,

  async listKeys(guildId) {
    ensureNonEmpty(guildId, 'guildId');

    const prisma = getPrismaClient();
    const entries = await prisma.faqEntry.findMany({
      orderBy: {
        key: 'asc',
      },
      select: {
        key: true,
      },
      where: {
        guildId,
      },
    });

    return entries.map((entry: { key: string }) => entry.key);
  },

  async set(guildId, faqKey, answer, updatedBy) {
    ensureNonEmpty(guildId, 'guildId');
    ensureNonEmpty(faqKey, 'faqKey');
    ensureNonEmpty(answer, 'answer');
    ensureNonEmpty(updatedBy, 'updatedBy');

    const prisma = getPrismaClient();
    const now = new Date();

    await prisma.faqEntry.upsert({
      create: {
        answer,
        guildId,
        key: faqKey,
        updatedAt: now,
        updatedBy,
      },
      update: {
        answer,
        updatedAt: now,
        updatedBy,
      },
      where: {
        guildId_key: {
          guildId,
          key: faqKey,
        },
      },
    });
  },
});
