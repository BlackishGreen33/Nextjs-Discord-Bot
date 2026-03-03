import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const discordGetMock = vi.fn();
const getCommandsMock = vi.fn();

vi.mock('@/common/configs', () => ({
  REGISTER_COMMANDS_KEY: 'debug-key',
}));

vi.mock('@/common/utils', () => ({
  createRequestLogger: () => ({
    ip: '127.0.0.1',
    log: vi.fn(),
    requestId: 'req-id',
  }),
  discord_api: {
    get: (...args: unknown[]) => discordGetMock(...args),
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

import { GET } from './route';

const buildRequest = (auth?: string) => {
  const headers = new Headers();

  if (auth) {
    headers.set('authorization', auth);
  }

  return new Request('http://localhost/api/discord-bot/debug', {
    headers,
    method: 'GET',
  });
};

describe('GET /api/discord-bot/debug', () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const previousNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();

    mutableEnv.NODE_ENV = 'test';
    mutableEnv.NEXT_PUBLIC_APPLICATION_ID = 'app-id';
    mutableEnv.PUBLIC_KEY = 'public-key';
    mutableEnv.BOT_TOKEN = 'bot-token';
    mutableEnv.REGISTER_COMMANDS_KEY = 'debug-key';

    getCommandsMock.mockResolvedValue({
      faq: {},
      help: {},
      ping: {},
    });

    discordGetMock.mockImplementation((path: string) => {
      if (path === '/oauth2/applications/@me') {
        return Promise.resolve({
          data: {
            id: 'app-id',
            verify_key: 'public-key',
          },
          status: 200,
        });
      }

      if (path === '/applications/app-id/commands') {
        return Promise.resolve({
          data: [{}, {}],
          status: 200,
        });
      }

      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });
  });

  afterAll(() => {
    mutableEnv.NODE_ENV = previousNodeEnv;
  });

  it('returns 404 in production', async () => {
    mutableEnv.NODE_ENV = 'production';

    const response = await GET(buildRequest('Bearer debug-key'));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found' });
  });

  it('returns 401 when authorization is missing', async () => {
    const response = await GET(buildRequest());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(discordGetMock).not.toHaveBeenCalled();
  });

  it('returns readiness payload when authorized', async () => {
    const response = await GET(buildRequest('Bearer debug-key'));
    const body = (await response.json()) as {
      applicationCheck: { ok: boolean; verifyKeyMatches: boolean | null };
      discordApiCheck: { ok: boolean; registeredCommandCount: number | null };
      env: Record<string, boolean>;
      localCommandNames: string[];
      ok: boolean;
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.env).toEqual({
      BOT_TOKEN: true,
      NEXT_PUBLIC_APPLICATION_ID: true,
      PUBLIC_KEY: true,
      REGISTER_COMMANDS_KEY: true,
    });
    expect(body.localCommandNames).toEqual(['faq', 'help', 'ping']);
    expect(body.discordApiCheck.ok).toBe(true);
    expect(body.discordApiCheck.registeredCommandCount).toBe(2);
    expect(body.applicationCheck.ok).toBe(true);
    expect(body.applicationCheck.verifyKeyMatches).toBe(true);
  });
});
