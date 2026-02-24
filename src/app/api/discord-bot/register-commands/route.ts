import { NextResponse } from 'next/server';

import { REGISTER_COMMANDS_KEY } from '@/common/configs';
import { discord_api, getCommands } from '@/common/utils';

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

const getClientIp = (req: Request) => {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }
  return req.headers.get('x-real-ip') ?? 'unknown';
};

const isRateLimited = (clientIp: string) => {
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

export async function POST(req: Request) {
  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  if (process.env.NODE_ENV === 'production') {
    const authorization = req.headers.get('authorization');
    const bearerPrefix = 'Bearer ';
    const requestKey =
      authorization && authorization.startsWith(bearerPrefix)
        ? authorization.slice(bearerPrefix.length)
        : null;

    if (!requestKey || requestKey !== REGISTER_COMMANDS_KEY) {
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

    return NextResponse.json({ error: null });
  } catch {
    return NextResponse.json({ error: 'Error occurred' }, { status: 500 });
  }
}
