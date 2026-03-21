import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = {
  faqEntry: {
    deleteMany: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
};

vi.mock('./prisma-client', () => ({
  getPrismaClient: () => prismaMock,
}));

import { createPrismaFaqStore } from './faq-store-prisma';

describe('createPrismaFaqStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps prisma FAQ entries to the store response shape', async () => {
    prismaMock.faqEntry.findUnique.mockResolvedValueOnce({
      answer: 'Hello there!',
      guildId: 'guild-1',
      key: 'welcome',
      updatedAt: new Date('2026-03-20T00:00:00.000Z'),
      updatedBy: 'user-1',
    });

    const store = createPrismaFaqStore();

    await expect(store.get('guild-1', 'welcome')).resolves.toEqual({
      answer: 'Hello there!',
      key: 'welcome',
      updatedAt: '2026-03-20T00:00:00.000Z',
      updatedBy: 'user-1',
    });
  });

  it('persists FAQ entries through prisma upsert', async () => {
    prismaMock.faqEntry.upsert.mockResolvedValueOnce({});

    const store = createPrismaFaqStore();
    await store.set('guild-1', 'rules', 'Be nice', 'user-2');

    expect(prismaMock.faqEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          answer: 'Be nice',
          guildId: 'guild-1',
          key: 'rules',
          updatedBy: 'user-2',
        }),
        where: {
          guildId_key: {
            guildId: 'guild-1',
            key: 'rules',
          },
        },
      })
    );
  });
});
