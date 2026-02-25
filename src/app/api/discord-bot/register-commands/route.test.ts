import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getCommandsMock = vi.fn();
const putMock = vi.fn();

vi.mock('@/common/configs', () => ({
  REGISTER_COMMANDS_KEY: 'test-register-key',
}));

vi.mock('@/common/utils', () => ({
  createRequestLogger: (_route: string, req: Request) => ({
    ip: req.headers.get('x-forwarded-for') ?? '127.0.0.1',
    log: vi.fn(),
    requestId: 'req-id',
  }),
  discord_api: {
    put: (...args: unknown[]) => putMock(...args),
  },
  extractBearerToken: (authorizationHeader: string | null) => {
    if (!authorizationHeader) return null;
    const bearerPrefix = 'Bearer ';
    return authorizationHeader.startsWith(bearerPrefix)
      ? authorizationHeader.slice(bearerPrefix.length)
      : null;
  },
  getCommands: (...args: unknown[]) => getCommandsMock(...args),
  timingSafeEqualString: (expected: string, actual: string | null) =>
    expected === actual,
}));

const importRoute = async () => {
  const route = await import('./route');
  return route.POST;
};

const buildRequest = (overrides?: {
  auth?: string;
  forwardedFor?: string;
  realIp?: string;
}) => {
  const headers = new Headers();
  if (overrides?.auth) headers.set('authorization', overrides.auth);
  if (overrides?.forwardedFor)
    headers.set('x-forwarded-for', overrides.forwardedFor);
  if (overrides?.realIp) headers.set('x-real-ip', overrides.realIp);

  return new Request('http://localhost/api/discord-bot/register-commands', {
    headers,
    method: 'POST',
  });
};

describe('POST /api/discord-bot/register-commands', () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAppId = process.env.NEXT_PUBLIC_APPLICATION_ID;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mutableEnv.NODE_ENV = 'test';
    mutableEnv.NEXT_PUBLIC_APPLICATION_ID = 'app-id-123';
    mutableEnv.UPSTASH_REDIS_REST_URL = undefined;
    mutableEnv.UPSTASH_REDIS_REST_TOKEN = undefined;
    getCommandsMock.mockResolvedValue({
      ping: {
        register: {
          toJSON: () => ({ description: 'Ping command', name: 'ping' }),
        },
      },
    });
    putMock.mockResolvedValue({ status: 200 });
  });

  it('returns 401 for unauthorized request in production', async () => {
    mutableEnv.NODE_ENV = 'production';
    const POST = await importRoute();

    const response = await POST(buildRequest({ forwardedFor: '1.1.1.1' }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(getCommandsMock).not.toHaveBeenCalled();
    expect(putMock).not.toHaveBeenCalled();
  });

  it('returns 429 when same ip exceeds rate limit window', async () => {
    const POST = await importRoute();
    const request = buildRequest({ forwardedFor: '2.2.2.2' });

    for (let i = 0; i < 5; i += 1) {
      const response = await POST(request);
      expect(response.status).toBe(200);
    }

    const limitedResponse = await POST(request);
    expect(limitedResponse.status).toBe(429);
    expect(await limitedResponse.json()).toEqual({
      error: 'Too many requests',
    });
    expect(limitedResponse.headers.get('Retry-After')).toBe('60');
  });

  it('returns 429 from redis-backed limiter when count exceeds threshold', async () => {
    mutableEnv.UPSTASH_REDIS_REST_URL = 'https://redis.test';
    mutableEnv.UPSTASH_REDIS_REST_TOKEN = 'token-value';
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ result: 6 }), { status: 200 })
    );

    const POST = await importRoute();
    const response = await POST(buildRequest({ forwardedFor: '4.4.4.4' }));

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'Too many requests' });
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://redis.test/incr/register_commands_rate_limit%3A4.4.4.4',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token-value',
        }),
        method: 'POST',
      })
    );
    expect(getCommandsMock).not.toHaveBeenCalled();
    expect(putMock).not.toHaveBeenCalled();
  });

  it('falls back to in-memory limiter when redis call fails', async () => {
    mutableEnv.UPSTASH_REDIS_REST_URL = 'https://redis.test';
    mutableEnv.UPSTASH_REDIS_REST_TOKEN = 'token-value';
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('redis unavailable'));

    const POST = await importRoute();
    const request = buildRequest({ forwardedFor: '5.5.5.5' });

    for (let i = 0; i < 5; i += 1) {
      const response = await POST(request);
      expect(response.status).toBe(200);
    }

    const limitedResponse = await POST(request);
    expect(limitedResponse.status).toBe(429);
    expect(await limitedResponse.json()).toEqual({
      error: 'Too many requests',
    });
    expect(limitedResponse.headers.get('Retry-After')).toBe('60');
  });

  it('registers commands successfully when request is allowed', async () => {
    const POST = await importRoute();

    const response = await POST(buildRequest({ forwardedFor: '3.3.3.3' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ error: null });
    expect(putMock).toHaveBeenCalledWith('/applications/app-id-123/commands', [
      { description: 'Ping command', name: 'ping' },
    ]);
  });

  afterAll(() => {
    mutableEnv.NODE_ENV = previousNodeEnv;
    mutableEnv.NEXT_PUBLIC_APPLICATION_ID = previousAppId;
  });
});
