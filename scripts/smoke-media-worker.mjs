#!/usr/bin/env node

const DEFAULT_TWITTER_URL = 'https://x.com/jack/status/20';
const DEFAULT_PIXIV_URL = 'https://www.pixiv.net/artworks/125459220';
const DEFAULT_BLUESKY_URL = 'https://bsky.app/profile/bsky.app/post/3mgdqebsaqk2b';
const DEFAULT_TRANSLATE_TARGET = 'zh-TW';
const DEFAULT_TIMEOUT_MS = 20000;

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
const workerBaseUrl = (args['worker-url'] ?? process.env.MEDIA_WORKER_BASE_URL ?? '').trim();
const workerToken = (args.token ?? process.env.MEDIA_WORKER_TOKEN ?? '').trim();
const twitterUrl = (args['twitter-url'] ?? DEFAULT_TWITTER_URL).trim();
const pixivUrl = (args['pixiv-url'] ?? DEFAULT_PIXIV_URL).trim();
const blueskyUrl = (args['bluesky-url'] ?? DEFAULT_BLUESKY_URL).trim();
const translateTarget = (args['translate-target'] ?? DEFAULT_TRANSLATE_TARGET).trim();
const gifMediaUrl = (args['gif-media-url'] ?? '').trim();
const timeoutMs = Number(args.timeout ?? DEFAULT_TIMEOUT_MS);

if (!workerBaseUrl) {
  process.stderr.write('Missing worker URL. Set MEDIA_WORKER_BASE_URL or --worker-url.\n');
  process.exit(2);
}

const buildHeaders = () => ({
  'Content-Type': 'application/json',
  ...(workerToken.length > 0
    ? {
        Authorization: `Bearer ${workerToken}`,
      }
    : {}),
});

const postJson = async (path, body) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const response = await fetch(`${workerBaseUrl}${path}`, {
      body: JSON.stringify(body),
      headers: buildHeaders(),
      method: 'POST',
      signal: controller.signal,
    });

    const elapsedMs = Date.now() - start;
    const text = await response.text();
    let payload = null;

    try {
      payload = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }

    return {
      elapsedMs,
      ok: response.ok,
      payload,
      status: response.status,
    };
  } catch (error) {
    const elapsedMs = Date.now() - start;
    return {
      elapsedMs,
      ok: false,
      payload: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      status: 0,
    };
  } finally {
    clearTimeout(timeoutId);
  }
};

const summarizePayload = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return String(payload);
  }

  const maybeError = typeof payload.error === 'string' ? payload.error : null;
  const maybePlatform = typeof payload.platform === 'string' ? payload.platform : null;
  const maybeTitle = typeof payload.title === 'string' ? payload.title : null;
  const maybeStatus = typeof payload.status === 'string' ? payload.status : null;

  return [maybePlatform, maybeTitle, maybeStatus, maybeError]
    .filter(Boolean)
    .join(' | ');
};

const checks = [];
const addCheck = (name, pass, detail) => {
  checks.push({ detail, name, pass });
};

const run = async () => {
  process.stdout.write(`Worker: ${workerBaseUrl}\n\n`);

  const twitterPreview = await postJson('/v1/preview', { sourceUrl: twitterUrl });
  addCheck(
    'twitter preview returns 200',
    twitterPreview.status === 200 && twitterPreview.payload?.platform === 'Twitter',
    `http=${twitterPreview.status} ${twitterPreview.elapsedMs}ms ${summarizePayload(twitterPreview.payload)}`
  );

  const pixivPreview = await postJson('/v1/preview', { sourceUrl: pixivUrl });
  addCheck(
    'pixiv preview returns 200',
    pixivPreview.status === 200 && pixivPreview.payload?.platform === 'Pixiv',
    `http=${pixivPreview.status} ${pixivPreview.elapsedMs}ms ${summarizePayload(pixivPreview.payload)}`
  );

  const blueskyPreview = await postJson('/v1/preview', { sourceUrl: blueskyUrl });
  addCheck(
    'bluesky preview returns 200',
    blueskyPreview.status === 200 && blueskyPreview.payload?.platform === 'Bluesky',
    `http=${blueskyPreview.status} ${blueskyPreview.elapsedMs}ms ${summarizePayload(blueskyPreview.payload)}`
  );

  const translate = await postJson('/v1/translate', {
    sourceUrl: twitterUrl,
    targetLanguage: translateTarget,
    text: 'hello world',
  });
  addCheck(
    'translate endpoint returns 200 or 503 when disabled',
    translate.status === 200 || translate.status === 503,
    `http=${translate.status} ${translate.elapsedMs}ms ${summarizePayload(translate.payload)}`
  );

  if (gifMediaUrl) {
    const gif = await postJson('/v1/gif', { mediaUrl: gifMediaUrl });
    addCheck(
      'gif endpoint returns ready result',
      gif.status === 200 && gif.payload?.status === 'ready',
      `http=${gif.status} ${gif.elapsedMs}ms ${summarizePayload(gif.payload)}`
    );
  }

  for (const check of checks) {
    process.stdout.write(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}\n`);
    process.stdout.write(`  ${check.detail}\n`);
  }

  const failed = checks.filter((check) => !check.pass);

  process.stdout.write(`\nSummary: ${checks.length - failed.length}/${checks.length} passed\n`);

  if (failed.length > 0) {
    process.exit(1);
  }
};

void run();
