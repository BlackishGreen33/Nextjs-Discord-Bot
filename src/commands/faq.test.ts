import { beforeEach, describe, expect, it, vi } from 'vitest';

const faqStoreMock = {
  delete: vi.fn(),
  get: vi.fn(),
  isAvailable: vi.fn(),
  listKeys: vi.fn(),
  set: vi.fn(),
};

vi.mock('@/common/stores', () => ({
  getFaqStore: () => faqStoreMock,
}));

import { execute, normalizeFaqKey } from './faq';

type InteractionBuildOptions = {
  answer?: string;
  guildId?: string;
  key?: string;
  permissions?: string;
  subcommand: 'delete' | 'get' | 'list' | 'set';
};

const buildInteraction = ({
  answer,
  guildId = 'guild-1',
  key,
  permissions = String(1 << 3),
  subcommand,
}: InteractionBuildOptions) => {
  const nestedOptions: Array<{ name: string; type: number; value: string }> =
    [];

  if (key) {
    nestedOptions.push({
      name: 'key',
      type: 3,
      value: key,
    });
  }

  if (answer) {
    nestedOptions.push({
      name: 'answer',
      type: 3,
      value: answer,
    });
  }

  return {
    data: {
      name: 'faq',
      options: [
        {
          name: subcommand,
          options: nestedOptions,
          type: 1,
        },
      ],
    },
    guild_id: guildId,
    member: {
      permissions,
      user: {
        id: 'member-id',
      },
    },
    user: {
      id: 'user-id',
    },
  } as Parameters<typeof execute>[0];
};

const asMessage = (response: Awaited<ReturnType<typeof execute>>) =>
  response as {
    data: { content: string; flags?: number };
    type: number;
  };

describe('/faq command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    faqStoreMock.isAvailable.mockReturnValue(true);
  });

  it('returns FAQ answer for /faq get when key exists', async () => {
    faqStoreMock.get.mockResolvedValue({
      answer: 'Welcome to the server!',
      key: 'welcome',
      updatedAt: '2026-03-03T00:00:00.000Z',
      updatedBy: 'user-1',
    });

    const response = asMessage(
      await execute(buildInteraction({ key: 'Welcome', subcommand: 'get' }))
    );

    expect(response.type).toBe(4);
    expect(response.data.content).toContain('**welcome**');
    expect(response.data.content).toContain('Welcome to the server!');
  });

  it('returns not-found message for /faq get when key is missing', async () => {
    faqStoreMock.get.mockResolvedValue(null);

    const response = asMessage(
      await execute(buildInteraction({ key: 'missing', subcommand: 'get' }))
    );

    expect(response.data.content).toContain('No FAQ entry found');
  });

  it('rejects /faq set for non-admin users', async () => {
    const response = asMessage(
      await execute(
        buildInteraction({
          answer: 'Answer',
          key: 'rules',
          permissions: '0',
          subcommand: 'set',
        })
      )
    );

    expect(response.data.flags).toBe(64);
    expect(response.data.content).toContain('Only server admins');
    expect(faqStoreMock.set).not.toHaveBeenCalled();
  });

  it('rejects /faq delete for non-admin users', async () => {
    const response = asMessage(
      await execute(
        buildInteraction({
          key: 'rules',
          permissions: '0',
          subcommand: 'delete',
        })
      )
    );

    expect(response.data.flags).toBe(64);
    expect(response.data.content).toContain('Only server admins');
    expect(faqStoreMock.delete).not.toHaveBeenCalled();
  });

  it('returns empty state for /faq list with no entries', async () => {
    faqStoreMock.listKeys.mockResolvedValue([]);

    const response = asMessage(
      await execute(buildInteraction({ subcommand: 'list' }))
    );

    expect(response.data.content).toContain('No FAQ entries yet');
  });

  it('truncates long /faq list responses', async () => {
    faqStoreMock.listKeys.mockResolvedValue(
      Array.from({ length: 30 }, (_, index) => `faq-${index + 1}`)
    );

    const response = asMessage(
      await execute(buildInteraction({ subcommand: 'list' }))
    );

    expect(response.data.content).toContain('FAQ keys (30)');
    expect(response.data.content).toContain('Showing first 25 entries.');
  });

  it('normalizes faq keys to slug format', () => {
    expect(normalizeFaqKey('  Welcome Rules!  ')).toBe('welcome-rules');
  });
});
