import { describe, expect, it } from 'vitest';

import { createFaqStore, type FaqCommandRunner } from './faq-store';

const createInMemoryRunner = () => {
  const values = new Map<string, string>();
  const sets = new Map<string, Set<string>>();

  const runCommand: FaqCommandRunner = async <T>(
    command: string,
    ...args: Array<number | string>
  ) => {
    const key = String(args[0] ?? '');

    switch (command) {
      case 'get':
        return (values.get(key) ?? null) as unknown as T;
      case 'set': {
        values.set(key, String(args[1] ?? ''));
        return 'OK' as unknown as T;
      }
      case 'del': {
        const existed = values.delete(key);
        return (existed ? 1 : 0) as unknown as T;
      }
      case 'sadd': {
        const member = String(args[1] ?? '');
        const bucket = sets.get(key) ?? new Set<string>();
        bucket.add(member);
        sets.set(key, bucket);
        return 1 as unknown as T;
      }
      case 'srem': {
        const member = String(args[1] ?? '');
        const bucket = sets.get(key);

        if (!bucket) {
          return 0 as unknown as T;
        }

        const deleted = bucket.delete(member);
        return (deleted ? 1 : 0) as unknown as T;
      }
      case 'smembers': {
        const members = Array.from(sets.get(key) ?? []);
        return members as unknown as T;
      }
      default:
        throw new Error(`Unsupported command in test runner: ${command}`);
    }
  };

  return {
    runCommand,
  };
};

describe('createFaqStore', () => {
  it('stores and retrieves FAQ entries', async () => {
    const { runCommand } = createInMemoryRunner();
    const store = createFaqStore({
      isAvailable: () => true,
      namespace: 'test-bot',
      runCommand,
    });

    await store.set('guild-1', 'welcome', 'Hello there!', 'user-1');
    const entry = await store.get('guild-1', 'welcome');

    expect(entry).not.toBeNull();
    expect(entry?.key).toBe('welcome');
    expect(entry?.answer).toBe('Hello there!');
    expect(entry?.updatedBy).toBe('user-1');
  });

  it('returns latest value when key is overwritten', async () => {
    const { runCommand } = createInMemoryRunner();
    const store = createFaqStore({
      isAvailable: () => true,
      runCommand,
    });

    await store.set('guild-2', 'rules', 'old', 'user-a');
    await store.set('guild-2', 'rules', 'new', 'user-b');

    const entry = await store.get('guild-2', 'rules');

    expect(entry?.answer).toBe('new');
    expect(entry?.updatedBy).toBe('user-b');
  });

  it('removes key from both value storage and index on delete', async () => {
    const { runCommand } = createInMemoryRunner();
    const store = createFaqStore({
      isAvailable: () => true,
      namespace: 'bot',
      runCommand,
    });

    await store.set('guild-3', 'faq-a', 'A', 'user-1');
    await store.set('guild-3', 'faq-b', 'B', 'user-1');

    const deleted = await store.delete('guild-3', 'faq-a');
    const deletedAgain = await store.delete('guild-3', 'faq-a');
    const keys = await store.listKeys('guild-3');
    const entry = await store.get('guild-3', 'faq-a');

    expect(deleted).toBe(true);
    expect(deletedAgain).toBe(false);
    expect(keys).toEqual(['faq-b']);
    expect(entry).toBeNull();
  });

  it('sorts listKeys alphabetically', async () => {
    const { runCommand } = createInMemoryRunner();
    const store = createFaqStore({
      isAvailable: () => true,
      runCommand,
    });

    await store.set('guild-4', 'zeta', '1', 'u');
    await store.set('guild-4', 'alpha', '2', 'u');

    const keys = await store.listKeys('guild-4');

    expect(keys).toEqual(['alpha', 'zeta']);
  });

  it('throws when storage is unavailable', async () => {
    const { runCommand } = createInMemoryRunner();
    const store = createFaqStore({
      isAvailable: () => false,
      runCommand,
    });

    await expect(store.listKeys('guild-5')).rejects.toThrow(
      'FAQ storage is not configured'
    );
  });
});
