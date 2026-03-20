import { createFaqStore, type FaqEntry, type FaqStore } from './faq-store';
import {
  createGuildSettingsStore,
  DEFAULT_GUILD_SETTINGS,
  type GuildSettings,
  type GuildSettingsStore,
} from './guild-settings-store';

let faqStore: FaqStore | null = null;
let guildSettingsStore: GuildSettingsStore | null = null;

export const getFaqStore = () => {
  if (!faqStore) {
    faqStore = createFaqStore({
      namespace: process.env.REDIS_NAMESPACE,
    });
  }

  return faqStore;
};

export const resetFaqStoreForTests = () => {
  faqStore = null;
};

export const getGuildSettingsStore = () => {
  if (!guildSettingsStore) {
    guildSettingsStore = createGuildSettingsStore({
      namespace: process.env.REDIS_NAMESPACE,
    });
  }

  return guildSettingsStore;
};

export const resetGuildSettingsStoreForTests = () => {
  guildSettingsStore = null;
};

export { createFaqStore, createGuildSettingsStore, DEFAULT_GUILD_SETTINGS };
export type { FaqEntry, FaqStore, GuildSettings, GuildSettingsStore };
