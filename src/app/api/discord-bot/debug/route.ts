import { NextResponse } from 'next/server';

import { REGISTER_COMMANDS_KEY } from '@/common/configs';
import { discord_api, getCommands } from '@/common/utils';

const mask = (value: string | undefined) => {
  if (!value) return null;
  if (value.length <= 8) return '*'.repeat(value.length);
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

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
    `[debug-endpoint] ${event} ${JSON.stringify({
      ts: new Date().toISOString(),
      ...payload,
    })}\n`
  );
};

export async function GET(req: Request) {
  const ip = getClientIp(req);
  const requestId = getRequestId(req);
  auditLog('request_received', { ip, requestId });

  if (process.env.NODE_ENV === 'production') {
    auditLog('blocked_in_production', { ip, requestId });
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const key = searchParams.get('REGISTER_COMMANDS_KEY');

  if (!key || key !== REGISTER_COMMANDS_KEY) {
    auditLog('unauthorized', { ip, requestId });
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
    auditLog('commands_check_failed', {
      ip,
      requestId,
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
    auditLog('application_check_failed', {
      ip,
      requestId,
      status: maybeError.status ?? null,
    });
  }

  auditLog('success', {
    appCheckOk: applicationCheck.ok,
    commandCheckOk: discordApiCheck.ok,
    ip,
    requestId,
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
