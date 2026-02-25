import { NextResponse } from 'next/server';

import { REGISTER_COMMANDS_KEY } from '@/common/configs';
import {
  createRequestLogger,
  discord_api,
  extractBearerToken,
  getCommands,
  timingSafeEqualString,
} from '@/common/utils';

const mask = (value: string | undefined) => {
  if (!value) return null;
  if (value.length <= 8) return '*'.repeat(value.length);
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

export async function GET(req: Request) {
  const { log } = createRequestLogger('debug-endpoint', req);
  log('request_received');

  if (process.env.NODE_ENV === 'production') {
    log('blocked_in_production', { status: 404 });
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const key = extractBearerToken(req.headers.get('authorization'));

  if (!timingSafeEqualString(REGISTER_COMMANDS_KEY, key)) {
    log('unauthorized', { status: 401 });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const env = {
    NEXT_PUBLIC_APPLICATION_ID: Boolean(process.env.NEXT_PUBLIC_APPLICATION_ID),
    PUBLIC_KEY: Boolean(process.env.PUBLIC_KEY),
    BOT_TOKEN: Boolean(process.env.BOT_TOKEN),
    REGISTER_COMMANDS_KEY: Boolean(process.env.REGISTER_COMMANDS_KEY),
  };

  const appId = process.env.NEXT_PUBLIC_APPLICATION_ID;
  const commands = await getCommands();
  const localCommandNames = Object.keys(commands);

  let discordApiCheck: {
    ok: boolean;
    status: number | null;
    registeredCommandCount: number | null;
    error: string | null;
  } = {
    ok: false,
    status: null,
    registeredCommandCount: null,
    error: null,
  };

  try {
    const res = await discord_api.get(`/applications/${appId}/commands`);
    discordApiCheck = {
      ok: true,
      status: res.status,
      registeredCommandCount: Array.isArray(res.data) ? res.data.length : null,
      error: null,
    };
  } catch (error) {
    const maybeError = error as {
      status?: number;
      message?: string;
    };
    discordApiCheck = {
      ok: false,
      status: maybeError.status ?? null,
      registeredCommandCount: null,
      error: maybeError.message ?? 'Unknown error',
    };
    log('commands_check_failed', {
      status: maybeError.status ?? null,
    });
  }

  let applicationCheck: {
    ok: boolean;
    status: number | null;
    appIdFromDiscord: string | null;
    verifyKeyMatches: boolean | null;
    error: string | null;
  } = {
    ok: false,
    status: null,
    appIdFromDiscord: null,
    verifyKeyMatches: null,
    error: null,
  };

  try {
    const res = await discord_api.get('/oauth2/applications/@me');
    const data = res.data as {
      id?: string;
      verify_key?: string;
    };
    applicationCheck = {
      ok: true,
      status: res.status,
      appIdFromDiscord: data.id ?? null,
      verifyKeyMatches: data.verify_key
        ? data.verify_key === process.env.PUBLIC_KEY
        : null,
      error: null,
    };
  } catch (error) {
    const maybeError = error as {
      status?: number;
      message?: string;
    };
    applicationCheck = {
      ok: false,
      status: maybeError.status ?? null,
      appIdFromDiscord: null,
      verifyKeyMatches: null,
      error: maybeError.message ?? 'Unknown error',
    };
    log('application_check_failed', {
      status: maybeError.status ?? null,
    });
  }

  log('success', {
    appCheckOk: applicationCheck.ok,
    commandCheckOk: discordApiCheck.ok,
    status: 200,
  });
  return NextResponse.json({
    ok: true,
    runtime: {
      node: process.version,
      timestamp: new Date().toISOString(),
    },
    env,
    masked: {
      NEXT_PUBLIC_APPLICATION_ID: mask(process.env.NEXT_PUBLIC_APPLICATION_ID),
      PUBLIC_KEY: mask(process.env.PUBLIC_KEY),
      BOT_TOKEN: mask(process.env.BOT_TOKEN),
      REGISTER_COMMANDS_KEY: mask(process.env.REGISTER_COMMANDS_KEY),
    },
    localCommandNames,
    discordApiCheck,
    applicationCheck,
  });
}
