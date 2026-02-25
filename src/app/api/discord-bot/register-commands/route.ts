import { NextResponse } from 'next/server';

import { REGISTER_COMMANDS_KEY } from '@/common/configs';
import {
  discord_api,
  extractBearerToken,
  getCommands,
  timingSafeEqualString,
} from '@/common/utils';

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_WINDOW_SECONDS = RATE_LIMIT_WINDOW_MS / 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const RATE_LIMIT_KEY_PREFIX = 'register_commands_rate_limit';

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_AUTH_HEADER = process.env.UPSTASH_REDIS_REST_TOKEN;

const getClientIp = (req: Request) => {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }
  return req.headers.get('x-real-ip') ?? 'unknown';
};

const getRequestId = (req: Request) =>
  req.headers.get('x-request-id') ?? crypto.randomUUID();

const auditLog = (
  event: string,
  payload: { ip: string; requestId: string; [key: string]: unknown }
) => {
  process.stdout.write(
    `[register-commands] ${event} ${JSON.stringify({
      ts: new Date().toISOString(),
      ...payload,
    })}\n`
  );
};

const isRateLimitedInMemory = (clientIp: string) => {
  const now = Date.now();
  const existing = rateLimitStore.get(clientIp);

  if (!existing || existing.resetAt <= now) {
    rateLimitStore.set(clientIp, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return false;
  }

  if (existing.count >= RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }

  existing.count += 1;
  rateLimitStore.set(clientIp, existing);
  return false;
};

const runUpstashCommand = async (
  command: string,
  key: string,
  value?: number
) => {
  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_AUTH_HEADER) return null;

  const encodedKey = encodeURIComponent(key);
  const encodedValue = value !== undefined ? `/${value}` : '';
  const response = await fetch(
    `${UPSTASH_REDIS_REST_URL}/${command}/${encodedKey}${encodedValue}`,
    {
      headers: {
        Authorization: `Bearer ${UPSTASH_REDIS_AUTH_HEADER}`,
      },
      method: 'POST',
    }
  );

  if (!response.ok) return null;

  const data = (await response.json()) as { result?: number | string };
  if (data.result === undefined) return null;

  return Number(data.result);
};

const isRateLimited = async (clientIp: string) => {
  const key = `${RATE_LIMIT_KEY_PREFIX}:${clientIp}`;

  try {
    const currentCount = await runUpstashCommand('incr', key);
    if (currentCount !== null) {
      if (currentCount === 1) {
        await runUpstashCommand('expire', key, RATE_LIMIT_WINDOW_SECONDS);
      }
      return currentCount > RATE_LIMIT_MAX_REQUESTS;
    }
  } catch {
    // Fallback to in-memory limiter when Redis is unreachable.
  }

  return isRateLimitedInMemory(clientIp);
};

export async function POST(req: Request) {
  const clientIp = getClientIp(req);
  const requestId = getRequestId(req);
  auditLog('request_received', { ip: clientIp, requestId });

  if (await isRateLimited(clientIp)) {
    auditLog('rate_limited', { ip: clientIp, requestId });
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        headers: {
          'Retry-After': String(RATE_LIMIT_WINDOW_SECONDS),
        },
        status: 429,
      }
    );
  }

  if (process.env.NODE_ENV === 'production') {
    const requestKey = extractBearerToken(req.headers.get('authorization'));

    if (!timingSafeEqualString(REGISTER_COMMANDS_KEY, requestKey)) {
      auditLog('unauthorized', { ip: clientIp, requestId });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const allCommands = await getCommands();
    const arrayOfSlashCommandsRegister = Object.values(allCommands);
    const arrayOfSlashCommandsRegisterJSON = arrayOfSlashCommandsRegister.map(
      (command) => command.register.toJSON()
    );

    await discord_api.put(
      `/applications/${process.env.NEXT_PUBLIC_APPLICATION_ID!}/commands`,
      arrayOfSlashCommandsRegisterJSON
    );

    auditLog('registered', {
      commandCount: arrayOfSlashCommandsRegisterJSON.length,
      ip: clientIp,
      requestId,
    });
    return NextResponse.json({ error: null });
  } catch {
    auditLog('register_failed', { ip: clientIp, requestId });
    return NextResponse.json({ error: 'Error occurred' }, { status: 500 });
  }
}
