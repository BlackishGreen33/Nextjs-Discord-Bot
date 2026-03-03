import { createFaqStore, type FaqEntry, type FaqStore } from './faq-store';

let faqStore: FaqStore | null = null;

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

export { createFaqStore };
export type { FaqEntry, FaqStore };
