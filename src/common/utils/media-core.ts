import {
  inferPlatformFromUrl,
  parseBlueskyPostUrl,
  parsePixivArtworkId,
  parseTwitterStatusId,
} from './media-link';
import type {
  MediaPreview,
  MediaPreviewItem,
  TranslateMediaTextResult,
} from './media-types';

type JsonRecord = Record<string, unknown>;

type EmbeddedMediaEnv = NodeJS.ProcessEnv & {
  BLUESKY_FALLBACK_BASE_URL?: string;
  BLUESKY_PUBLIC_BASE_URL?: string;
  FXEMBED_FALLBACK_BASE_URL?: string;
  FXEMBED_PUBLIC_BASE_URL?: string;
  PHIXIV_FALLBACK_BASE_URL?: string;
  PHIXIV_PUBLIC_BASE_URL?: string;
  TRANSLATE_API_BASE_URL?: string;
  TRANSLATE_API_KEY?: string;
};

const DEFAULT_BLUESKY_PUBLIC_BASE_URL = 'https://public.api.bsky.app/xrpc';
const DEFAULT_FXEMBED_PUBLIC_BASE_URL = 'https://api.fxtwitter.com';
const DEFAULT_PHIXIV_PUBLIC_BASE_URL = 'https://phixiv.net';
const DEFAULT_VXTWITTER_PUBLIC_BASE_URL = 'https://api.vxtwitter.com';
const JSON_HEADERS = {
  'Content-Type': 'application/json',
};
const SENSITIVE_LABEL_HINTS = [
  'graphic-media',
  'nudity',
  'porn',
  'sexual',
  'suggestive',
];

const asNumberOrNull = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const asStringOrNull = (value: unknown) =>
  typeof value === 'string' && value.length > 0 ? value : null;

const buildTitleFromText = (value: string | null | undefined) => {
  const normalized = asStringOrNull(value)?.trim();

  if (!normalized) {
    return null;
  }

  const firstLine = normalized
    .split('\n')
    .find((line) => line.trim().length > 0);

  if (!firstLine) {
    return null;
  }

  return firstLine.slice(0, 240);
};

const toIsoString = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : value;
};

const fetchJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  return (await response.json()) as T;
};

const tryBases = async <T>(
  bases: Array<string | undefined>,
  runner: (baseUrl: string) => Promise<T>
) => {
  let lastError: unknown = null;

  for (const candidate of bases) {
    const baseUrl = candidate?.trim();

    if (!baseUrl) {
      continue;
    }

    try {
      return await runner(baseUrl.replace(/\/$/, ''));
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error('No provider base URL was configured.');
};

const parseTwitterHandle = (url: string) => {
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

const getTwitterBestVideoUrl = (media: JsonRecord) => {
  const variants = Array.isArray(media.variants)
    ? (media.variants as Array<JsonRecord>)
    : [];

  const mp4Variants = variants
    .filter(
      (variant) =>
        variant.content_type === 'video/mp4' && typeof variant.url === 'string'
    )
    .sort(
      (left, right) => Number(right.bitrate ?? 0) - Number(left.bitrate ?? 0)
    );

  return asStringOrNull(mp4Variants[0]?.url) ?? asStringOrNull(media.url);
};

const mapTwitterMedia = (value: unknown): MediaPreviewItem[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce<MediaPreviewItem[]>((accumulator, item) => {
    if (!item || typeof item !== 'object') {
      return accumulator;
    }

    const media = item as JsonRecord;
    const type = asStringOrNull(media.type);

    if (type === 'photo' || type === 'image') {
      const url =
        asStringOrNull(media.url) ?? asStringOrNull(media.thumbnail_url);

      if (!url) {
        return accumulator;
      }

      accumulator.push({
        altText: null,
        gifConvertible: false,
        previewUrl: url,
        sourceUrl: url,
        type: 'image',
      } satisfies MediaPreviewItem);
      return accumulator;
    }

    if (type === 'video' || type === 'animated_gif') {
      const previewUrl =
        asStringOrNull(media.thumbnail_url) ?? asStringOrNull(media.url);
      const sourceUrl = getTwitterBestVideoUrl(media);

      if (!previewUrl) {
        return accumulator;
      }

      accumulator.push({
        altText: null,
        gifConvertible: type === 'video',
        previewUrl,
        sourceUrl,
        type: type === 'animated_gif' ? 'gif' : 'video',
      } satisfies MediaPreviewItem);
      return accumulator;
    }

    return accumulator;
  }, []);
};

const fetchTwitterApiPayload = async (
  baseUrl: string,
  statusId: string,
  handle: string | null
) => {
  const paths = Array.from(
    new Set(
      [
        `/status/${statusId}`,
        handle ? `/${handle}/status/${statusId}` : null,
        `/Twitter/status/${statusId}`,
        `/i/status/${statusId}`,
      ].filter((value): value is string => Boolean(value))
    )
  );

  let lastError: unknown = null;

  for (const path of paths) {
    try {
      return await fetchJson<JsonRecord>(`${baseUrl}${path}`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error('Twitter preview provider did not return data.');
};

const fetchTwitterPreview = async (
  env: EmbeddedMediaEnv,
  sourceUrl: string
): Promise<MediaPreview> => {
  const statusId = parseTwitterStatusId(sourceUrl);
  const handle = parseTwitterHandle(sourceUrl);

  if (!statusId) {
    throw new Error('Twitter status ID could not be parsed.');
  }

  const payload = await tryBases<JsonRecord>(
    [
      env.FXEMBED_PUBLIC_BASE_URL ?? DEFAULT_FXEMBED_PUBLIC_BASE_URL,
      env.FXEMBED_FALLBACK_BASE_URL,
      DEFAULT_VXTWITTER_PUBLIC_BASE_URL,
    ],
    (baseUrl) => fetchTwitterApiPayload(baseUrl, statusId, handle)
  );

  const tweet =
    payload.tweet && typeof payload.tweet === 'object'
      ? (payload.tweet as JsonRecord)
      : payload;
  const author =
    tweet.author && typeof tweet.author === 'object'
      ? (tweet.author as JsonRecord)
      : null;
  const media =
    tweet.media && typeof tweet.media === 'object'
      ? (tweet.media as JsonRecord)
      : null;
  const allMedia =
    media?.all ??
    (Array.isArray(tweet.media_extended) ? tweet.media_extended : null);
  const text = asStringOrNull(tweet.text);

  return {
    authorAvatarUrl:
      asStringOrNull(author?.avatar_url) ??
      asStringOrNull(tweet.user_profile_image_url),
    authorHandle: asStringOrNull(author?.screen_name)
      ? `@${author?.screen_name as string}`
      : asStringOrNull(tweet.user_screen_name)
        ? `@${tweet.user_screen_name as string}`
        : null,
    authorName: asStringOrNull(author?.name) ?? asStringOrNull(tweet.user_name),
    canonicalUrl:
      asStringOrNull(tweet.url) ?? asStringOrNull(tweet.tweetURL) ?? sourceUrl,
    likes: asNumberOrNull(tweet.likes),
    media: mapTwitterMedia(allMedia),
    platform: 'Twitter',
    publishedAt: toIsoString(
      asStringOrNull(tweet.created_at) ?? asStringOrNull(tweet.date)
    ),
    replies: asNumberOrNull(tweet.replies),
    reposts:
      asNumberOrNull(tweet.retweets) ?? asNumberOrNull(tweet.retweet_count),
    sensitive: Boolean(tweet.possibly_sensitive),
    sourceUrl,
    text,
    title: buildTitleFromText(text) ?? 'Twitter post',
    translatedText: null,
  };
};

const fetchPixivPreview = async (
  env: EmbeddedMediaEnv,
  sourceUrl: string
): Promise<MediaPreview> => {
  const artworkId = parsePixivArtworkId(sourceUrl);

  if (!artworkId) {
    throw new Error('Pixiv artwork ID could not be parsed.');
  }

  type PhixivResponse = {
    author_id?: string;
    author_name?: string;
    bookmark_count?: number;
    comment_count?: number;
    create_date?: string;
    description?: string;
    image_proxy_urls?: string[];
    like_count?: number;
    profile_image_url?: string;
    title?: string;
    url?: string;
    x_restrict?: number;
  };

  const payload = await tryBases<PhixivResponse>(
    [
      env.PHIXIV_PUBLIC_BASE_URL ?? DEFAULT_PHIXIV_PUBLIC_BASE_URL,
      env.PHIXIV_FALLBACK_BASE_URL,
    ],
    (baseUrl) => fetchJson(`${baseUrl}/api/info?id=${artworkId}&language=en`)
  );

  const imageUrls = Array.isArray(payload.image_proxy_urls)
    ? payload.image_proxy_urls
    : [];

  return {
    authorAvatarUrl: asStringOrNull(payload.profile_image_url),
    authorHandle: asStringOrNull(payload.author_id)
      ? `@${payload.author_id}`
      : null,
    authorName: asStringOrNull(payload.author_name),
    canonicalUrl: asStringOrNull(payload.url) ?? sourceUrl,
    likes: asNumberOrNull(payload.like_count),
    media: imageUrls.flatMap((url) =>
      typeof url === 'string' && url.length > 0
        ? [
            {
              altText: null,
              gifConvertible: false,
              previewUrl: url,
              sourceUrl: url,
              type: 'image',
            } satisfies MediaPreviewItem,
          ]
        : []
    ),
    platform: 'Pixiv',
    publishedAt: toIsoString(asStringOrNull(payload.create_date)),
    replies: asNumberOrNull(payload.comment_count),
    reposts: asNumberOrNull(payload.bookmark_count),
    sensitive: Number(payload.x_restrict ?? 0) > 0,
    sourceUrl,
    text: asStringOrNull(payload.description),
    title: asStringOrNull(payload.title) ?? 'Pixiv artwork',
    translatedText: null,
  };
};

const hasSensitiveLabels = (labels: unknown) => {
  if (!Array.isArray(labels)) {
    return false;
  }

  return labels.some((item) => {
    if (!item || typeof item !== 'object') {
      return false;
    }

    const value = asStringOrNull((item as JsonRecord).val)?.toLowerCase();

    if (!value) {
      return false;
    }

    return SENSITIVE_LABEL_HINTS.some((hint) => value.includes(hint));
  });
};

const collectBlueskyMedia = (embed: unknown): MediaPreviewItem[] => {
  if (!embed || typeof embed !== 'object') {
    return [];
  }

  const view = embed as JsonRecord;
  const type = asStringOrNull(view.$type);

  if (type === 'app.bsky.embed.images#view') {
    const images = Array.isArray(view.images)
      ? (view.images as Array<JsonRecord>)
      : [];

    return images.flatMap((image) => {
      const previewUrl =
        asStringOrNull(image.fullsize) ?? asStringOrNull(image.thumb);

      if (!previewUrl) {
        return [];
      }

      return [
        {
          altText: asStringOrNull(image.alt),
          gifConvertible: false,
          previewUrl,
          sourceUrl: previewUrl,
          type: 'image',
        } satisfies MediaPreviewItem,
      ];
    });
  }

  if (type === 'app.bsky.embed.video#view') {
    const previewUrl = asStringOrNull(view.thumbnail);

    if (!previewUrl) {
      return [];
    }

    return [
      {
        altText: asStringOrNull(view.alt),
        gifConvertible: true,
        previewUrl,
        sourceUrl: asStringOrNull(view.playlist),
        type: 'video',
      } satisfies MediaPreviewItem,
    ];
  }

  if (type === 'app.bsky.embed.external#view') {
    const external =
      view.external && typeof view.external === 'object'
        ? (view.external as JsonRecord)
        : null;
    const previewUrl = asStringOrNull(external?.thumb);

    if (!previewUrl) {
      return [];
    }

    return [
      {
        altText: asStringOrNull(external?.description),
        gifConvertible: false,
        previewUrl,
        sourceUrl: asStringOrNull(external?.uri),
        type: 'image',
      } satisfies MediaPreviewItem,
    ];
  }

  if (type === 'app.bsky.embed.record#view') {
    const record =
      view.record && typeof view.record === 'object'
        ? (view.record as JsonRecord)
        : null;
    const nestedEmbeds = Array.isArray(record?.embeds)
      ? (record.embeds as Array<JsonRecord>)
      : [];

    return nestedEmbeds.flatMap((item) => collectBlueskyMedia(item));
  }

  return [];
};

const fetchBlueskyPreview = async (
  env: EmbeddedMediaEnv,
  sourceUrl: string
): Promise<MediaPreview> => {
  const parsed = parseBlueskyPostUrl(sourceUrl);

  if (!parsed) {
    throw new Error('Bluesky post URL could not be parsed.');
  }

  const baseUrl =
    env.BLUESKY_PUBLIC_BASE_URL?.trim() ?? DEFAULT_BLUESKY_PUBLIC_BASE_URL;

  type ResolveHandleResponse = {
    did?: string;
  };

  const handlePayload = await fetchJson<ResolveHandleResponse>(
    `${baseUrl}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(parsed.handle)}`
  );

  if (!handlePayload.did) {
    throw new Error('Bluesky handle could not be resolved.');
  }

  type PostThreadResponse = {
    thread?: JsonRecord;
  };

  const uri = `at://${handlePayload.did}/app.bsky.feed.post/${parsed.rkey}`;
  const threadPayload = await fetchJson<PostThreadResponse>(
    `${baseUrl}/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=0&parentHeight=0`
  );

  const thread =
    threadPayload.thread && typeof threadPayload.thread === 'object'
      ? threadPayload.thread
      : null;
  const post =
    thread?.post && typeof thread.post === 'object'
      ? (thread.post as JsonRecord)
      : null;

  if (!post) {
    throw new Error('Bluesky thread response did not include the post.');
  }

  const author =
    post.author && typeof post.author === 'object'
      ? (post.author as JsonRecord)
      : null;
  const record =
    post.record && typeof post.record === 'object'
      ? (post.record as JsonRecord)
      : null;

  return {
    authorAvatarUrl: asStringOrNull(author?.avatar),
    authorHandle: asStringOrNull(author?.handle)
      ? `@${author?.handle as string}`
      : null,
    authorName: asStringOrNull(author?.displayName),
    canonicalUrl: sourceUrl,
    likes: asNumberOrNull(post.likeCount),
    media: collectBlueskyMedia(post.embed),
    platform: 'Bluesky',
    publishedAt: toIsoString(
      asStringOrNull(record?.createdAt) ?? asStringOrNull(post.indexedAt)
    ),
    replies: asNumberOrNull(post.replyCount),
    reposts: asNumberOrNull(post.repostCount),
    sensitive:
      hasSensitiveLabels(post.labels) || hasSensitiveLabels(author?.labels),
    sourceUrl,
    text: asStringOrNull(record?.text),
    title: buildTitleFromText(asStringOrNull(record?.text)) ?? 'Bluesky post',
    translatedText: null,
  };
};

export const createMinimalPreview = (sourceUrl: string): MediaPreview => ({
  authorAvatarUrl: null,
  authorHandle: null,
  authorName: null,
  canonicalUrl: sourceUrl,
  likes: null,
  media: [],
  platform: inferPlatformFromUrl(sourceUrl),
  publishedAt: null,
  replies: null,
  reposts: null,
  sensitive: false,
  sourceUrl,
  text: null,
  title: null,
  translatedText: null,
});

export const fetchEmbeddedPreview = async (
  sourceUrl: string,
  env: EmbeddedMediaEnv = process.env
): Promise<MediaPreview> => {
  const platform = inferPlatformFromUrl(sourceUrl);

  if (platform === 'Twitter') {
    return fetchTwitterPreview(env, sourceUrl);
  }

  if (platform === 'Pixiv') {
    return fetchPixivPreview(env, sourceUrl);
  }

  if (platform === 'Bluesky') {
    return fetchBlueskyPreview(env, sourceUrl);
  }

  return createMinimalPreview(sourceUrl);
};

export const translateMediaTextEmbedded = async (
  params: {
    targetLanguage: string;
    text: string;
  },
  env: EmbeddedMediaEnv = process.env
): Promise<TranslateMediaTextResult> => {
  const baseUrl = env.TRANSLATE_API_BASE_URL?.trim();

  if (!baseUrl) {
    throw new Error(
      'Translate service is not configured. Set TRANSLATE_API_BASE_URL.'
    );
  }

  const translateResponse = await fetch(
    `${baseUrl.replace(/\/$/, '')}/translate`,
    {
      body: JSON.stringify({
        api_key: env.TRANSLATE_API_KEY?.trim() || undefined,
        format: 'text',
        q: params.text,
        source: 'auto',
        target: params.targetLanguage,
      }),
      headers: JSON_HEADERS,
      method: 'POST',
    }
  );

  const responseText = await translateResponse.text();
  const responsePayload =
    responseText.length > 0
      ? (() => {
          try {
            return JSON.parse(responseText) as JsonRecord;
          } catch {
            return null;
          }
        })()
      : null;

  if (!translateResponse.ok) {
    throw new Error(
      asStringOrNull(responsePayload?.error) ??
        'Translate provider request failed.'
    );
  }

  const translatedText =
    asStringOrNull(responsePayload?.translatedText) ??
    asStringOrNull(responsePayload?.translated_text);

  if (!translatedText) {
    throw new Error('Translate provider did not return text.');
  }

  return {
    provider: 'translate-api',
    translatedText,
  };
};
