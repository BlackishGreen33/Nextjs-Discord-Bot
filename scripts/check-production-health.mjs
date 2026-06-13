#!/usr/bin/env node

const DEFAULT_WEB_URL = 'https://nextjs-discord-bot-eta.vercel.app';
const DEFAULT_TIMEOUT_MS = 15000;

const parseArgs = (argv) => {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (!current.startsWith('--')) {
      continue;
    }

    const key = current.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith('--')) {
      args[key] = 'true';
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
};

const args = parseArgs(process.argv.slice(2));
const webUrl = (
  args['web-url'] ??
  process.env.PRODUCTION_WEB_URL ??
  DEFAULT_WEB_URL
).replace(/\/$/, '');
const listenerUrl = (
  args['listener-url'] ??
  process.env.LISTENER_HEALTH_URL ??
  ''
).replace(/\/$/, '');
const mediaUrl = (
  args['media-url'] ??
  process.env.MEDIA_SERVICE_BASE_URL ??
  process.env.MEDIA_WORKER_BASE_URL ??
  ''
).replace(/\/$/, '');
const registerKey = (
  args['register-key'] ??
  process.env.REGISTER_COMMANDS_KEY ??
  ''
).trim();
const mediaToken = (
  args['media-token'] ??
  process.env.MEDIA_SERVICE_TOKEN ??
  process.env.MEDIA_WORKER_TOKEN ??
  ''
).trim();
const botToken = (args['bot-token'] ?? process.env.BOT_TOKEN ?? '').trim();
const shouldRegisterCommands = args['register-commands'] === 'true';
const expectedEndpoint = `${webUrl}/api/discord-bot/interactions`;
const timeoutMs = Number(args.timeout ?? DEFAULT_TIMEOUT_MS);

const checks = [];

const addCheck = (name, pass, detail) => {
  checks.push({ detail, name, pass });
};

const request = async (url, init = {}) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = text;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      // Keep raw text.
    }

    return {
      elapsedMs: Date.now() - start,
      payload,
      status: response.status,
    };
  } catch (error) {
    return {
      elapsedMs: Date.now() - start,
      payload: error instanceof Error ? error.message : String(error),
      status: 0,
    };
  } finally {
    clearTimeout(timeoutId);
  }
};

const summarize = (payload) => {
  if (payload === null || payload === undefined) {
    return '';
  }

  if (typeof payload === 'string') {
    return payload.slice(0, 160);
  }

  if (typeof payload === 'object') {
    return JSON.stringify(payload).slice(0, 240);
  }

  return String(payload);
};

const run = async () => {
  process.stdout.write(`Web URL: ${webUrl}\n`);
  if (listenerUrl) {
    process.stdout.write(`Listener URL: ${listenerUrl}\n`);
  }
  if (mediaUrl) {
    process.stdout.write(`Media URL: ${mediaUrl}\n`);
  }
  process.stdout.write('\n');

  const home = await request(`${webUrl}/`);
  addCheck(
    'web home returns 200',
    home.status === 200,
    `http=${home.status} ${home.elapsedMs}ms`
  );

  const debug = await request(`${webUrl}/api/discord-bot/debug`);
  addCheck(
    'production debug endpoint is hidden',
    debug.status === 404,
    `http=${debug.status} ${debug.elapsedMs}ms ${summarize(debug.payload)}`
  );

  const unsignedInteraction = await request(
    `${webUrl}/api/discord-bot/interactions`,
    {
      body: '{}',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
  addCheck(
    'unsigned Discord interaction is rejected by app',
    unsignedInteraction.status === 401 &&
      summarize(unsignedInteraction.payload).includes('Invalid request'),
    `http=${unsignedInteraction.status} ${unsignedInteraction.elapsedMs}ms ${summarize(unsignedInteraction.payload)}`
  );

  if (shouldRegisterCommands && registerKey) {
    const register = await request(
      `${webUrl}/api/discord-bot/register-commands`,
      {
        headers: {
          Authorization: `Bearer ${registerKey}`,
        },
        method: 'POST',
      }
    );
    addCheck(
      'register commands endpoint succeeds',
      register.status === 200 &&
        register.payload &&
        typeof register.payload === 'object' &&
        register.payload.error === null,
      `http=${register.status} ${register.elapsedMs}ms ${summarize(register.payload)}`
    );
  } else {
    addCheck(
      'register commands endpoint skipped',
      true,
      shouldRegisterCommands
        ? 'REGISTER_COMMANDS_KEY not set'
        : 'pass --register-commands to re-register slash commands'
    );
  }

  if (botToken) {
    const app = await request(
      'https://discord.com/api/v10/oauth2/applications/@me',
      {
        headers: {
          Authorization: `Bot ${botToken}`,
        },
      }
    );
    addCheck(
      'Discord app endpoint matches production web URL',
      app.status === 200 &&
        app.payload &&
        typeof app.payload === 'object' &&
        app.payload.interactions_endpoint_url === expectedEndpoint,
      `http=${app.status} ${app.elapsedMs}ms endpoint=${app.payload?.interactions_endpoint_url ?? '<missing>'}`
    );
  } else {
    addCheck('Discord app endpoint skipped', true, 'BOT_TOKEN not set');
  }

  if (mediaUrl) {
    const mediaHealth = await request(`${mediaUrl}/health`, {
      headers: mediaToken
        ? {
            Authorization: `Bearer ${mediaToken}`,
          }
        : undefined,
    });
    addCheck(
      'media worker health returns ok',
      mediaHealth.status === 200 &&
        mediaHealth.payload &&
        typeof mediaHealth.payload === 'object' &&
        mediaHealth.payload.status === 'ok',
      `http=${mediaHealth.status} ${mediaHealth.elapsedMs}ms ${summarize(mediaHealth.payload)}`
    );
  } else {
    addCheck('media worker health skipped', true, 'media URL not set');
  }

  if (listenerUrl) {
    const healthUrl = listenerUrl.endsWith('/healthz')
      ? listenerUrl
      : `${listenerUrl}/healthz`;
    const listener = await request(healthUrl);
    addCheck(
      'gateway listener health is ready',
      listener.status === 200 &&
        listener.payload &&
        typeof listener.payload === 'object' &&
        listener.payload.ready === true &&
        listener.payload.gatewayPhase === 'ready' &&
        listener.payload.restProbe?.ok === true,
      `http=${listener.status} ${listener.elapsedMs}ms ${summarize(listener.payload)}`
    );
  } else {
    addCheck(
      'gateway listener health skipped',
      true,
      'LISTENER_HEALTH_URL not set'
    );
  }

  for (const check of checks) {
    process.stdout.write(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}\n`);
    process.stdout.write(`  ${check.detail}\n`);
  }

  const failed = checks.filter((check) => !check.pass);
  process.stdout.write(
    `\nSummary: ${checks.length - failed.length}/${checks.length} passed\n`
  );

  if (failed.length > 0) {
    process.exit(1);
  }
};

void run();
