import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../configs', () => ({
  BOT_TOKEN: 'bot-token',
}));

import fetchBotCommands, { discord_api } from './discord-api';

describe('discord_api', () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const previousAppId = process.env.NEXT_PUBLIC_APPLICATION_ID;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    mutableEnv.NEXT_PUBLIC_APPLICATION_ID = 'app-id-123';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries retryable status codes and eventually succeeds', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'temporary issue' }), {
          status: 500,
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      );

    const response = await discord_api.get<{ ok: boolean }>('/health');

    expect(response.status).toBe(200);
    expect(response.data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://discord.com/api/health',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bot bot-token',
          'Content-Type': 'application/json',
        }),
        method: 'GET',
      })
    );
  });

  it('retries network failures and throws after max retries', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('network unavailable'));

    await expect(discord_api.get('/network-test')).rejects.toMatchObject({
      name: 'DiscordApiError',
      status: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('aborts timed-out requests and throws when all retries fail', async () => {
    vi.useFakeTimers();

    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockImplementation((_input, init) => {
        return new Promise((_resolve, reject) => {
          const signal = init?.signal;

          if (signal) {
            signal.addEventListener('abort', () => {
              reject(new Error('request aborted'));
            });
          }
        });
      });

    const pendingRequest = expect(
      discord_api.get('/timeout-test')
    ).rejects.toMatchObject({
      name: 'DiscordApiError',
      status: 0,
    });

    await vi.advanceTimersByTimeAsync(16000);

    await pendingRequest;

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('fetchBotCommands uses NEXT_PUBLIC_APPLICATION_ID', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ name: 'ping' }]), {
        status: 200,
      })
    );

    const response = await fetchBotCommands();

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://discord.com/api/applications/app-id-123/commands',
      expect.objectContaining({
        method: 'GET',
      })
    );
  });

  afterEach(() => {
    mutableEnv.NEXT_PUBLIC_APPLICATION_ID = previousAppId;
  });
});
