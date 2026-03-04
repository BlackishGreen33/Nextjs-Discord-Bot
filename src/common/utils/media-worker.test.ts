import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMediaDownload,
  getMediaPreview,
  isMediaWorkerConfigured,
} from './media-worker';

describe('media-worker utils', () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const previousBaseUrl = process.env.MEDIA_WORKER_BASE_URL;
  const previousToken = process.env.MEDIA_WORKER_TOKEN;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete mutableEnv.MEDIA_WORKER_BASE_URL;
    delete mutableEnv.MEDIA_WORKER_TOKEN;
  });

  afterEach(() => {
    if (previousBaseUrl === undefined) {
      delete mutableEnv.MEDIA_WORKER_BASE_URL;
    } else {
      mutableEnv.MEDIA_WORKER_BASE_URL = previousBaseUrl;
    }

    if (previousToken === undefined) {
      delete mutableEnv.MEDIA_WORKER_TOKEN;
    } else {
      mutableEnv.MEDIA_WORKER_TOKEN = previousToken;
    }
  });

  it('returns fallback preview when worker is not configured', async () => {
    const preview = await getMediaPreview('https://x.com/user/status/1');

    expect(isMediaWorkerConfigured()).toBe(false);
    expect(preview.platform).toBe('Twitter');
    expect(preview.sourceUrl).toBe('https://x.com/user/status/1');
    expect(preview.title).toBeNull();
  });

  it('returns error result when download is requested without worker config', async () => {
    const result = await createMediaDownload({
      channelId: 'channel',
      guildId: 'guild',
      requesterId: 'user',
      sourceUrl: 'https://x.com/user/status/1',
      type: 'video',
    });

    expect(result.status).toBe('error');
    expect(result.message).toContain('not configured');
  });

  it('calls worker endpoints when configured', async () => {
    mutableEnv.MEDIA_WORKER_BASE_URL = 'https://media-worker.example';
    mutableEnv.MEDIA_WORKER_TOKEN = 'worker-token';

    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            authorName: 'Alice',
            platform: 'Twitter',
            sourceUrl: 'https://x.com/user/status/1',
            text: 'Hello',
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            mediaUrl: 'https://cdn.example/video.mp4',
            provider: 'cobalt',
            status: 'ready',
          }),
          { status: 200 }
        )
      );

    const preview = await getMediaPreview('https://x.com/user/status/1');
    const downloadResult = await createMediaDownload({
      channelId: 'channel',
      guildId: 'guild',
      requesterId: 'user',
      sourceUrl: 'https://x.com/user/status/1',
      type: 'video',
    });

    expect(preview.authorName).toBe('Alice');
    expect(downloadResult.status).toBe('ready');
    expect(downloadResult.mediaUrl).toBe('https://cdn.example/video.mp4');
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'https://media-worker.example/v1/preview',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer worker-token',
        }),
        method: 'POST',
      })
    );
  });
});
