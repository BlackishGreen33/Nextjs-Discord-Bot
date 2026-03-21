import { getStorageDriver } from '@/common/configs/deployment';

import { createFaqStore, type FaqEntry, type FaqStore } from './faq-store';
import { createPrismaFaqStore } from './faq-store-prisma';
import {
  createGuildSettingsStore,
  DEFAULT_GUILD_SETTINGS,
  type GuildSettings,
  type GuildSettingsStore,
} from './guild-settings-store';
import { createPrismaGuildSettingsStore } from './guild-settings-store-prisma';

let faqStore: FaqStore | null = null;
let guildSettingsStore: GuildSettingsStore | null = null;

export const getFaqStore = () => {
  if (!faqStore) {
    faqStore =
      getStorageDriver() === 'redis'
        ? createFaqStore({
            namespace: process.env.REDIS_NAMESPACE,
          })
        : createPrismaFaqStore();
  }

  return faqStore;
};

export const resetFaqStoreForTests = () => {
  faqStore = null;
};

export const getGuildSettingsStore = () => {
  if (!guildSettingsStore) {
    guildSettingsStore =
      getStorageDriver() === 'redis'
        ? createGuildSettingsStore({
            namespace: process.env.REDIS_NAMESPACE,
          })
        : createPrismaGuildSettingsStore();
  }

  return guildSettingsStore;
};

export const resetGuildSettingsStoreForTests = () => {
  guildSettingsStore = null;
};

export {
  createFaqStore,
  createGuildSettingsStore,
  createPrismaFaqStore,
  createPrismaGuildSettingsStore,
  DEFAULT_GUILD_SETTINGS,
};
export type { FaqEntry, FaqStore, GuildSettings, GuildSettingsStore };
