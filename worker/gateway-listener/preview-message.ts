const DEFAULT_PREVIEW_DEDUPE_TTL_MS = 5 * 60 * 1000;

export const buildPreviewReplyNonce = (sourceMessageId: string) =>
  `pv:${sourceMessageId.slice(-22)}`;

export const createPreviewMessageDeduper = (
  ttlMs = DEFAULT_PREVIEW_DEDUPE_TTL_MS
) => {
  const expiresAtByMessageId = new Map<string, number>();

  return {
    claim(messageId: string, now = Date.now()) {
      expiresAtByMessageId.forEach((expiresAt, storedMessageId) => {
        if (expiresAt <= now) {
          expiresAtByMessageId.delete(storedMessageId);
        }
      });

      if ((expiresAtByMessageId.get(messageId) ?? 0) > now) {
        return false;
      }

      expiresAtByMessageId.set(messageId, now + ttlMs);
      return true;
    },
  };
};
