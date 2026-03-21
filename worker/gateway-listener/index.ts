/* eslint-disable no-console */

import { Client, GatewayIntentBits } from 'discord.js';
import { createServer } from 'node:http';

import {
  DEFAULT_GUILD_SETTINGS,
  getGuildSettingsStore,
} from '../../src/common/stores';
import {
  extractFirstSupportedMediaUrl,
  getMediaPreview,
  inferPlatformFromUrl,
} from '../../src/common/utils';
import { buildPreviewMessagePayload } from '../../src/common/utils/preview-card';
import { buildPreviewFiles } from './preview-attachments.mjs';

const token = process.env.DISCORD_GATEWAY_TOKEN ?? process.env.BOT_TOKEN;
const port = Number.parseInt(process.env.PORT ?? '', 10);
const LOGIN_TIMEOUT_MS = 30000;

if (!token) {
  throw new Error('DISCORD_GATEWAY_TOKEN or BOT_TOKEN is required');
}

const toPlatformKey = (sourceUrl: string) => {
  const platform = inferPlatformFromUrl(sourceUrl);

  if (platform === 'Twitter') {
    return 'twitter';
  }

  if (platform === 'Pixiv') {
    return 'pixiv';
  }

  if (platform === 'Bluesky') {
    return 'bluesky';
  }

  return null;
};

const getStoredSettings = async (guildId: string) => {
  const store = getGuildSettingsStore();

  if (!store.isAvailable()) {
    return DEFAULT_GUILD_SETTINGS;
  }

  try {
    return await store.get(guildId);
  } catch {
    return DEFAULT_GUILD_SETTINGS;
  }
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const gatewayState = {
  debugMessages: [] as string[],
  lastError: null as string | null,
  phase: 'starting',
  readyAt: null as string | null,
  restProbe: {
    ok: null as boolean | null,
    status: null as number | null,
    summary: null as string | null,
  },
};

const pushDebugMessage = (value: unknown) => {
  const normalized = typeof value === 'string' ? value.trim() : String(value);

  if (!normalized) {
    return;
  }

  gatewayState.debugMessages = [
    normalized,
    ...gatewayState.debugMessages,
  ].slice(0, 8);
};

const runDiscordRestProbe = async () => {
  try {
    const response = await fetch('https://discord.com/api/v10/users/@me', {
      headers: {
        Authorization: `Bot ${token}`,
      },
    });

    gatewayState.restProbe.status = response.status;

    if (!response.ok) {
      const payload = await response.text();
      gatewayState.restProbe.ok = false;
      gatewayState.restProbe.summary = payload.slice(0, 400);
      return;
    }

    const payload = (await response.json()) as {
      id?: string;
      username?: string;
    };

    gatewayState.restProbe.ok = true;
    gatewayState.restProbe.summary =
      typeof payload.username === 'string' && typeof payload.id === 'string'
        ? `${payload.username} (${payload.id})`
        : 'ok';
  } catch (error) {
    gatewayState.restProbe.ok = false;
    gatewayState.restProbe.summary =
      error instanceof Error ? error.message : String(error);
  }
};

const createHealthServer = () => {
  if (!Number.isFinite(port) || port <= 0) {
    return null;
  }

  const server = createServer((request, response) => {
    if (!request.url || !['/', '/health', '/healthz'].includes(request.url)) {
      response.writeHead(404, {
        'Content-Type': 'application/json; charset=utf-8',
      });
      response.end(JSON.stringify({ error: 'not_found' }));
      return;
    }

    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
    });
    response.end(
      JSON.stringify({
        debugMessages: gatewayState.debugMessages,
        gatewayLastError: gatewayState.lastError,
        gatewayPhase: gatewayState.phase,
        hasToken: Boolean(token),
        readyAt: gatewayState.readyAt,
        restProbe: gatewayState.restProbe,
        service: 'discord-gateway-listener',
        ready: Boolean(client.user),
        startedAt: client.readyAt?.toISOString() ?? null,
      })
    );
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`[gateway-listener] health server listening on ${port}`);
  });

  return server;
};

createHealthServer();

client.on('ready', () => {
  gatewayState.lastError = null;
  gatewayState.phase = 'ready';
  gatewayState.readyAt =
    client.readyAt?.toISOString() ?? new Date().toISOString();
  console.log(
    `[gateway-listener] logged in as ${client.user?.tag ?? 'unknown'}`
  );
});

client.on('error', (error) => {
  gatewayState.lastError =
    error instanceof Error ? error.message : String(error);
  gatewayState.phase = 'client_error';
  console.error('[gateway-listener] client error', error);
});

client.on('shardError', (error) => {
  gatewayState.lastError =
    error instanceof Error ? error.message : String(error);
  gatewayState.phase = 'shard_error';
  console.error('[gateway-listener] shard error', error);
});

client.on('shardDisconnect', (event) => {
  gatewayState.lastError = `gateway disconnected (${event.code}${event.reason ? `: ${event.reason}` : ''})`;
  gatewayState.phase = 'shard_disconnected';
  console.error('[gateway-listener] shard disconnected', {
    code: event.code,
    reason: event.reason,
    wasClean: event.wasClean,
  });
});

client.on('shardReconnecting', () => {
  gatewayState.phase = 'shard_reconnecting';
});

client.on('shardResume', () => {
  gatewayState.lastError = null;
  gatewayState.phase = 'shard_resumed';
});

client.on('debug', (message) => {
  pushDebugMessage(message);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guildId) {
    return;
  }

  const sourceUrl = extractFirstSupportedMediaUrl(message.content);

  if (!sourceUrl) {
    return;
  }

  const settings = await getStoredSettings(message.guildId);

  if (!settings.autoPreview.enabled) {
    return;
  }

  const platformKey = toPlatformKey(sourceUrl);

  if (!platformKey || !settings.autoPreview.platforms[platformKey]) {
    return;
  }

  try {
    const preview = await getMediaPreview(sourceUrl);
    const payload = buildPreviewMessagePayload(preview, settings, {
      ownerUserId: message.author.id,
      sourceMessageId: message.id,
    });
    const files = await buildPreviewFiles(preview, settings, process.env);

    await message.reply({
      ...((files.length ?? 0) > 0 ? { files } : {}),
      ...payload,
      failIfNotExists: false,
    });
  } catch (error) {
    console.error('[gateway-listener] failed to create preview card', error);
  }
});

gatewayState.phase = 'login_pending';
runDiscordRestProbe();
setTimeout(() => {
  if (!client.user && gatewayState.phase === 'login_pending') {
    gatewayState.phase = 'login_timeout';
    gatewayState.lastError =
      gatewayState.lastError ?? 'gateway login timed out';
  }
}, LOGIN_TIMEOUT_MS);

client.login(token).catch((error) => {
  gatewayState.lastError =
    error instanceof Error ? error.message : String(error);
  gatewayState.phase = 'login_failed';
  console.error('[gateway-listener] login failed', error);
});
