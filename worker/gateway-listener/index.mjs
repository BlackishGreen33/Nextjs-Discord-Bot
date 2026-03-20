import { createServer } from 'node:http';

import { Client, GatewayIntentBits } from 'discord.js';

import { buildPreviewFiles } from './preview-attachments.mjs';
import { formatUiDateTime, getUiText } from './ui-text.mjs';

const token = process.env.DISCORD_GATEWAY_TOKEN ?? process.env.BOT_TOKEN;
const port = Number.parseInt(process.env.PORT ?? '', 10);
const LOGIN_TIMEOUT_MS = 30000;

if (!token) {
  throw new Error('DISCORD_GATEWAY_TOKEN or BOT_TOKEN is required');
}

const PREVIEW_ACTION_PREFIX = 'pv:v1';
const REDIS_NAMESPACE = process.env.REDIS_NAMESPACE?.trim() || 'discord-bot';
const URL_REGEX = /https?:\/\/[^\s<>"']+/gi;
const DEFAULT_ALLOWED_DOMAINS = [
  'bsky.app',
  'pixiv.net',
  'twitter.com',
  'www.pixiv.net',
  'x.com',
];
const DEFAULT_FXEMBED_PUBLIC_BASE_URL = 'https://api.fxtwitter.com';
const DEFAULT_VXTWITTER_PUBLIC_BASE_URL = 'https://api.vxtwitter.com';
const DEFAULT_GUILD_SETTINGS = {
  autoPreview: {
    enabled: true,
    features: {
      gif: true,
      translate: true,
    },
    nsfwMode: false,
    outputMode: 'embed',
    platforms: {
      bluesky: true,
      pixiv: true,
      twitter: true,
    },
    translationTarget: 'zh-TW',
  },
  updatedAt: '',
  updatedBy: '',
};

const allowedDomains = (
  process.env.MEDIA_ALLOWED_DOMAINS ??
  DEFAULT_ALLOWED_DOMAINS.join(',')
)
  .split(',')
  .map((domain) => domain.trim().toLowerCase())
  .filter((domain) => domain.length > 0);

const createCustomId = (action, ownerId, sourceMessageId) =>
  `${PREVIEW_ACTION_PREFIX}:${action}:${ownerId}:${sourceMessageId}`;

const normalizeUrl = (value) => {
  try {
    const parsed = new URL(value);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }

    const normalizedHost = parsed.hostname.toLowerCase();

    const supported = allowedDomains.some(
      (domain) =>
        normalizedHost === domain || normalizedHost.endsWith(`.${domain}`)
    );

    if (!supported) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
};

const extractFirstSupportedUrl = (content) => {
  const candidates = content.match(URL_REGEX) ?? [];

  for (const candidate of candidates) {
    const normalized = normalizeUrl(candidate);

    if (normalized) {
      return normalized;
    }
  }

  return null;
};

const inferPlatformKey = (sourceUrl) => {
  const hostname = new URL(sourceUrl).hostname.toLowerCase();

  if (hostname.includes('x.com') || hostname.includes('twitter.com')) {
    return 'twitter';
  }

  if (hostname.includes('pixiv.net')) {
    return 'pixiv';
  }

  if (hostname.includes('bsky.app')) {
    return 'bluesky';
  }

  return null;
};

const parseTwitterStatusId = (url) => {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const statusIndex = segments.findIndex((segment) => segment === 'status');

    if (statusIndex === -1) {
      return null;
    }

    return segments[statusIndex + 1] ?? null;
  } catch {
    return null;
  }
};

const parseTwitterHandle = (url) => {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const statusIndex = segments.findIndex((segment) => segment === 'status');

    if (statusIndex <= 0) {
      return null;
    }

    return segments[statusIndex - 1] ?? null;
  } catch {
    return null;
  }
};

const trimText = (value, maxLength) => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
};

const formatCount = (value) =>
  typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('en-US').format(value)
    : '-';

const asStringOrNull = (value) =>
  typeof value === 'string' && value.length > 0 ? value : null;

const asNumberOrNull = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const toIsoString = (value) => {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : value;
};

const fetchJson = async (url) => {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  return response.json();
};

const getTwitterBestVideoUrl = (media) => {
  const variants = Array.isArray(media.variants) ? media.variants : [];

  const mp4Variants = variants
    .filter(
      (variant) =>
        variant?.content_type === 'video/mp4' &&
        typeof variant?.url === 'string'
    )
    .sort(
      (left, right) => Number(right?.bitrate ?? 0) - Number(left?.bitrate ?? 0)
    );

  return asStringOrNull(mp4Variants[0]?.url) ?? asStringOrNull(media.url);
};

const normalizeTwitterMedia = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const type = asStringOrNull(item.type);

    if (type === 'photo' || type === 'image') {
      const url = asStringOrNull(item.url) ?? asStringOrNull(item.thumbnail_url);

      if (!url) {
        return [];
      }

      return [
        {
          altText: null,
          gifConvertible: false,
          previewUrl: url,
          sourceUrl: url,
          type: 'image',
        },
      ];
    }

    if (type === 'video' || type === 'animated_gif') {
      const previewUrl =
        asStringOrNull(item.thumbnail_url) ?? asStringOrNull(item.url);
      const sourceUrl = getTwitterBestVideoUrl(item);

      if (!previewUrl) {
        return [];
      }

      return [
        {
          altText: null,
          gifConvertible: type === 'video',
          previewUrl,
          sourceUrl,
          type: type === 'animated_gif' ? 'gif' : 'video',
        },
      ];
    }

    return [];
  });
};

const getTwitterPreviewBases = () =>
  Array.from(
    new Set(
      [
        process.env.FXEMBED_PUBLIC_BASE_URL?.trim(),
        process.env.FXEMBED_FALLBACK_BASE_URL?.trim(),
        DEFAULT_FXEMBED_PUBLIC_BASE_URL,
        process.env.VXTWITTER_FALLBACK_BASE_URL?.trim(),
        DEFAULT_VXTWITTER_PUBLIC_BASE_URL,
      ].filter(Boolean)
    )
  );

const fetchTwitterApiPayload = async (baseUrl, statusId, handle) => {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const paths = Array.from(
    new Set(
      [
        `/status/${statusId}`,
        handle ? `/${handle}/status/${statusId}` : null,
        `/i/status/${statusId}`,
      ].filter(Boolean)
    )
  );

  let lastError = null;

  for (const path of paths) {
    try {
      return await fetchJson(`${normalizedBaseUrl}${path}`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error('Twitter preview provider did not return data.');
};

const fetchTwitterPreviewDirect = async (sourceUrl) => {
  const statusId = parseTwitterStatusId(sourceUrl);
  const handle = parseTwitterHandle(sourceUrl);

  if (!statusId) {
    throw new Error('Twitter status ID could not be parsed.');
  }

  let lastError = null;

  for (const baseUrl of getTwitterPreviewBases()) {
    try {
      const payload = await fetchTwitterApiPayload(baseUrl, statusId, handle);
      const tweet =
        payload?.tweet && typeof payload.tweet === 'object'
          ? payload.tweet
          : payload;
      const author =
        tweet?.author && typeof tweet.author === 'object' ? tweet.author : null;
      const media =
        tweet?.media && typeof tweet.media === 'object' ? tweet.media : null;
      const allMedia =
        media?.all ?? (Array.isArray(tweet?.media_extended) ? tweet.media_extended : null);
      const text = asStringOrNull(tweet?.text);

      return {
        authorAvatarUrl:
          asStringOrNull(author?.avatar_url) ??
          asStringOrNull(tweet?.user_profile_image_url),
        authorHandle: asStringOrNull(author?.screen_name)
          ? `@${author.screen_name}`
          : asStringOrNull(tweet?.user_screen_name)
            ? `@${tweet.user_screen_name}`
            : null,
        authorName: asStringOrNull(author?.name) ?? asStringOrNull(tweet?.user_name),
        canonicalUrl:
          asStringOrNull(tweet?.url) ??
          asStringOrNull(tweet?.tweetURL) ??
          sourceUrl,
        likes: asNumberOrNull(tweet?.likes),
        media: normalizeTwitterMedia(allMedia),
        platform: 'Twitter',
        publishedAt: toIsoString(
          asStringOrNull(tweet?.created_at) ?? asStringOrNull(tweet?.date)
        ),
        replies: asNumberOrNull(tweet?.replies),
        reposts:
          asNumberOrNull(tweet?.retweets) ??
          asNumberOrNull(tweet?.retweet_count),
        sensitive: Boolean(tweet?.possibly_sensitive),
        sourceUrl,
        text,
        title: trimText(text, 240) ?? 'Twitter post',
        translatedText: null,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error('Twitter preview provider did not return data.');
};

const buildDescription = (preview, settings) => {
  const text = getUiText(settings.autoPreview.translationTarget);
  const baseText = trimText(preview.text, 1100);

  if (preview.sensitive && !settings.autoPreview.nsfwMode) {
    const warning = text.preview.sensitiveHidden;

    return baseText ? `${warning}\n\n${baseText}` : warning;
  }

  return baseText ?? null;
};

const buildMessagePayload = (preview, settings, ownerId, sourceMessageId) => {
  const text = getUiText(settings.autoPreview.translationTarget);
  const authorName =
    preview.authorName || preview.authorHandle
      ? `${preview.authorName ?? ''} ${preview.authorHandle ?? ''}`.trim()
      : text.common.unknownAuthor;
  const components = [];

  if (settings.autoPreview.features.translate && trimText(preview.text, 200)) {
    components.push({
      custom_id: createCustomId('translate', ownerId, sourceMessageId),
      emoji: { name: '🌐' },
      style: 2,
      type: 2,
    });
  }

  if (
    settings.autoPreview.features.gif &&
    Array.isArray(preview.media) &&
    preview.media.some((item) => item.gifConvertible && item.sourceUrl)
  ) {
    components.push({
      custom_id: createCustomId('gif', ownerId, sourceMessageId),
      emoji: { name: '🎬' },
      style: 2,
      type: 2,
    });
  }

  components.push({
    custom_id: createCustomId('retract', ownerId, sourceMessageId),
    emoji: { name: '🗑️' },
    style: 2,
    type: 2,
  });

  const mainMedia =
    preview.sensitive && !settings.autoPreview.nsfwMode
      ? null
      : preview.media?.[0] ?? null;
  const embeds = [
    {
      author: {
        icon_url: preview.authorAvatarUrl ?? undefined,
        name: `${preview.platform} | ${authorName}`,
      },
      color: 0x1d9bf0,
      description: buildDescription(preview, settings) ?? undefined,
      fields:
        settings.autoPreview.outputMode === 'embed'
          ? [
              {
                inline: true,
                name: text.preview.fields.replies,
                value: formatCount(preview.replies),
              },
              {
                inline: true,
                name: text.preview.fields.reposts,
                value: formatCount(preview.reposts),
              },
              {
                inline: true,
                name: text.preview.fields.likes,
                value: formatCount(preview.likes),
              },
            ].filter((field) => field.value !== '-')
          : undefined,
      footer: {
        text: formatUiDateTime(
          preview.publishedAt,
          settings.autoPreview.translationTarget
        )
          ? `${text.preview.footer.publishedAt}：${formatUiDateTime(preview.publishedAt, settings.autoPreview.translationTarget)}`
          : `${text.preview.footer.source}：${preview.platform}`,
      },
      image: mainMedia?.previewUrl
        ? {
            url: mainMedia.previewUrl,
          }
        : undefined,
      title: trimText(preview.title, 240) ?? `${preview.platform}`,
      url: preview.canonicalUrl || preview.sourceUrl,
    },
    ...(settings.autoPreview.outputMode === 'embed' &&
    !(preview.sensitive && !settings.autoPreview.nsfwMode)
      ? (preview.media ?? []).slice(1, 4).flatMap((item) =>
          item.previewUrl
            ? [
                {
                  color: 0x1d9bf0,
                  image: { url: item.previewUrl },
                  url: preview.canonicalUrl || preview.sourceUrl,
                },
              ]
            : []
        )
      : []),
  ];

  return {
    components: [
      {
        components,
        type: 1,
      },
    ],
    content: undefined,
    embeds,
  };
};

const getRedisConfig = () => ({
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
  url: process.env.UPSTASH_REDIS_REST_URL,
});

const fetchGuildSettings = async (guildId) => {
  const { token, url } = getRedisConfig();

  if (!url || !token) {
    return DEFAULT_GUILD_SETTINGS;
  }

  const key = encodeURIComponent(`${REDIS_NAMESPACE}:guild-settings:${guildId}`);
  const response = await fetch(`${url}/get/${key}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    method: 'POST',
  });

  if (!response.ok) {
    return DEFAULT_GUILD_SETTINGS;
  }

  const payload = await response.json();
  const rawValue = payload?.result;

  if (typeof rawValue !== 'string' || rawValue.length === 0) {
    return DEFAULT_GUILD_SETTINGS;
  }

  try {
    const parsed = JSON.parse(rawValue);

    return {
      autoPreview: {
        enabled:
          typeof parsed?.autoPreview?.enabled === 'boolean'
            ? parsed.autoPreview.enabled
            : DEFAULT_GUILD_SETTINGS.autoPreview.enabled,
        features: {
          gif:
            typeof parsed?.autoPreview?.features?.gif === 'boolean'
              ? parsed.autoPreview.features.gif
              : DEFAULT_GUILD_SETTINGS.autoPreview.features.gif,
          translate:
            typeof parsed?.autoPreview?.features?.translate === 'boolean'
              ? parsed.autoPreview.features.translate
              : DEFAULT_GUILD_SETTINGS.autoPreview.features.translate,
        },
        nsfwMode:
          typeof parsed?.autoPreview?.nsfwMode === 'boolean'
            ? parsed.autoPreview.nsfwMode
            : DEFAULT_GUILD_SETTINGS.autoPreview.nsfwMode,
        outputMode:
          parsed?.autoPreview?.outputMode === 'image' ? 'image' : 'embed',
        platforms: {
          bluesky:
            typeof parsed?.autoPreview?.platforms?.bluesky === 'boolean'
              ? parsed.autoPreview.platforms.bluesky
              : DEFAULT_GUILD_SETTINGS.autoPreview.platforms.bluesky,
          pixiv:
            typeof parsed?.autoPreview?.platforms?.pixiv === 'boolean'
              ? parsed.autoPreview.platforms.pixiv
              : DEFAULT_GUILD_SETTINGS.autoPreview.platforms.pixiv,
          twitter:
            typeof parsed?.autoPreview?.platforms?.twitter === 'boolean'
              ? parsed.autoPreview.platforms.twitter
              : DEFAULT_GUILD_SETTINGS.autoPreview.platforms.twitter,
        },
        translationTarget:
          typeof parsed?.autoPreview?.translationTarget === 'string'
            ? parsed.autoPreview.translationTarget
            : DEFAULT_GUILD_SETTINGS.autoPreview.translationTarget,
      },
      updatedAt:
        typeof parsed?.updatedAt === 'string'
          ? parsed.updatedAt
          : DEFAULT_GUILD_SETTINGS.updatedAt,
      updatedBy:
        typeof parsed?.updatedBy === 'string'
          ? parsed.updatedBy
          : DEFAULT_GUILD_SETTINGS.updatedBy,
    };
  } catch {
    return DEFAULT_GUILD_SETTINGS;
  }
};

const fetchPreview = async (sourceUrl) => {
  if (inferPlatformKey(sourceUrl) === 'twitter') {
    try {
      return await fetchTwitterPreviewDirect(sourceUrl);
    } catch {
      // Fall through to worker fetch when direct providers are unavailable.
    }
  }

  const workerBaseUrl = process.env.MEDIA_WORKER_BASE_URL?.trim();

  if (!workerBaseUrl) {
    return {
      authorAvatarUrl: null,
      authorHandle: null,
      authorName: null,
      canonicalUrl: sourceUrl,
      likes: null,
      media: [],
      platform: inferPlatformKey(sourceUrl) ?? 'media',
      publishedAt: null,
      replies: null,
      reposts: null,
      sensitive: false,
      sourceUrl,
      text: null,
      title: null,
      translatedText: null,
    };
  }

  const response = await fetch(`${workerBaseUrl}/v1/preview`, {
    body: JSON.stringify({ sourceUrl }),
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.MEDIA_WORKER_TOKEN
        ? {
            Authorization: `Bearer ${process.env.MEDIA_WORKER_TOKEN}`,
          }
        : {}),
    },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`preview request failed: ${response.status}`);
  }

  return response.json();
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const gatewayState = {
  debugMessages: [],
  lastError: null,
  phase: 'starting',
  readyAt: null,
  restProbe: {
    ok: null,
    status: null,
    summary: null,
  },
};

const pushDebugMessage = (value) => {
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

    const payload = await response.json();
    gatewayState.restProbe.ok = true;
    gatewayState.restProbe.summary =
      typeof payload?.username === 'string' && typeof payload?.id === 'string'
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
      response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: 'not_found' }));
      return;
    }

    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
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
  gatewayState.readyAt = client.readyAt?.toISOString() ?? new Date().toISOString();
  console.log(`[gateway-listener] logged in as ${client.user?.tag ?? 'unknown'}`);
});

client.on('error', (error) => {
  gatewayState.lastError = error instanceof Error ? error.message : String(error);
  gatewayState.phase = 'client_error';
  console.error('[gateway-listener] client error', error);
});

client.on('shardError', (error) => {
  gatewayState.lastError = error instanceof Error ? error.message : String(error);
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
  if (message.author.bot) {
    return;
  }

  if (!message.guildId) {
    return;
  }

  const sourceUrl = extractFirstSupportedUrl(message.content);

  if (!sourceUrl) {
    return;
  }

  const settings = await fetchGuildSettings(message.guildId);

  if (!settings.autoPreview.enabled) {
    return;
  }

  const platformKey = inferPlatformKey(sourceUrl);

  if (!platformKey || !settings.autoPreview.platforms[platformKey]) {
    return;
  }

  try {
    const preview = await fetchPreview(sourceUrl);
    const payload = buildMessagePayload(
      preview,
      settings,
      message.author.id,
      message.id
    );
    const files = await buildPreviewFiles(preview, settings);

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
    gatewayState.lastError = gatewayState.lastError ?? 'gateway login timed out';
  }
}, LOGIN_TIMEOUT_MS);
client.login(token).catch((error) => {
  gatewayState.lastError = error instanceof Error ? error.message : String(error);
  gatewayState.phase = 'login_failed';
  console.error('[gateway-listener] login failed', error);
});
