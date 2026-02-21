import { NextResponse } from 'next/server';

import { REGISTER_COMMANDS_KEY } from '@/common/configs';
import { discord_api, getCommands } from '@/common/utils';

const mask = (value: string | undefined) => {
  if (!value) return null;
  if (value.length <= 8) return '*'.repeat(value.length);
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('REGISTER_COMMANDS_KEY');

  if (!key || key !== REGISTER_COMMANDS_KEY) {
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
      response?: { status?: number };
      message?: string;
    };
    discordApiCheck = {
      ok: false,
      status: maybeError.response?.status ?? null,
      registeredCommandCount: null,
      error: maybeError.message ?? 'Unknown error',
    };
  }

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
  });
}
