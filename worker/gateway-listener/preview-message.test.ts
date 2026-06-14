import { describe, expect, it } from 'vitest';

import {
  buildPreviewReplyNonce,
  createPreviewMessageDeduper,
} from './preview-message';

describe('preview message helpers', () => {
  it('builds a stable reply nonce from the source message id', () => {
    expect(buildPreviewReplyNonce('1234567890')).toBe('preview:1234567890');
  });

  it('claims each source message once until the dedupe window expires', () => {
    const deduper = createPreviewMessageDeduper(1000);

    expect(deduper.claim('message-1', 100)).toBe(true);
    expect(deduper.claim('message-1', 200)).toBe(false);
    expect(deduper.claim('message-1', 1101)).toBe(true);
  });
});
