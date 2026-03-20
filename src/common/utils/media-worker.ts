import { inferPlatformFromUrl, parseTwitterStatusId } from './media-link';

export type MediaPreviewItem = {
  altText: string | null;
  gifConvertible: boolean;
  previewUrl: string;
  sourceUrl: string | null;
  type: 'gif' | 'image' | 'video';
};

export type MediaPreview = {
  authorAvatarUrl: string | null;
  authorHandle: string | null;
  authorName: string | null;
  canonicalUrl: string | null;
  likes: number | null;
  media: MediaPreviewItem[];
  platform: string;
  publishedAt: string | null;
  replies: number | null;
  reposts: number | null;
  sensitive: boolean;
  sourceUrl: string;
  text: string | null;
  title: string | null;
  translatedText: string | null;
};

export type MediaGifResult = {
  expiresAt: string | null;
  gifUrl: string | null;
  message: string | null;
  provider: string | null;
  status: 'error' | 'queued' | 'ready';
};

export type TranslateMediaTextResult = {
  provider: string | null;
  translatedText: string;
};

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_FXEMBED_PUBLIC_BASE_URL = 'https://api.fxtwitter.com';
const DEFAULT_VXTWITTER_PUBLIC_BASE_URL = 'https://api.vxtwitter.com';

type JsonRecord = Record<string, unknown>;

class MediaWorkerHttpError extends Error {
  payload: unknown;
  status: number;

  constructor(status: number, payload: unknown) {
    super(`Media worker request failed with status ${status}`);
    this.name = 'MediaWorkerHttpError';
    this.payload = payload;
    this.status = status;
  }
}

const parseTimeoutMs = () => {
  const timeoutRaw = process.env.MEDIA_WORKER_TIMEOUT_MS;
  const timeout = Number(timeoutRaw);

  if (!Number.isFinite(timeout) || timeout <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }

  return timeout;
};

const getWorkerBaseUrl = () => process.env.MEDIA_WORKER_BASE_URL?.trim() ?? '';

const getWorkerToken = () => process.env.MEDIA_WORKER_TOKEN?.trim() ?? '';

export const isMediaWorkerConfigured = () => getWorkerBaseUrl().length > 0;

const postWorker = async <T>(path: string, body: object): Promise<T> => {
  const baseUrl = getWorkerBaseUrl();

  if (!baseUrl) {
    throw new Error('MEDIA_WORKER_BASE_URL is not configured');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), parseTimeoutMs());

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        ...(getWorkerToken()
          ? {
              Authorization: `Bearer ${getWorkerToken()}`,
            }
          : {}),
      },
      method: 'POST',
      signal: controller.signal,
    });

    const text = await response.text();
    const payload =
      text.length > 0
        ? (() => {
            try {
              return JSON.parse(text) as unknown;
            } catch {
              return text;
            }
          })()
        : null;

    if (!response.ok) {
      throw new MediaWorkerHttpError(response.status, payload);
    }

    return payload as T;
  } finally {
    clearTimeout(timeoutId);
  }
};

const toMinimalPreview = (sourceUrl: string): MediaPreview => ({
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

const asStringOrNull = (value: unknown) =>
  typeof value === 'string' && value.length > 0 ? value : null;

const asNumberOrNull = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const toIsoString = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : value;
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

const fetchJson = async <T>(url: string) => {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  return (await response.json()) as T;
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

const normalizePreviewMedia = (value: unknown): MediaPreviewItem[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const candidate = item as Partial<MediaPreviewItem>;

    if (
      typeof candidate.previewUrl !== 'string' ||
      candidate.previewUrl.length === 0
    ) {
      return [];
    }

    const type =
      candidate.type === 'gif' || candidate.type === 'video'
        ? candidate.type
        : 'image';

    return [
      {
        altText: asStringOrNull(candidate.altText),
        gifConvertible: Boolean(candidate.gifConvertible),
        previewUrl: candidate.previewUrl,
        sourceUrl: asStringOrNull(candidate.sourceUrl),
        type,
      },
    ];
  });
};

const normalizeTwitterPreviewMedia = (value: unknown): MediaPreviewItem[] => {
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
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const paths = Array.from(
    new Set(
      [
        `/status/${statusId}`,
        handle ? `/${handle}/status/${statusId}` : null,
        '/i/status/' + statusId,
      ].filter((value): value is string => Boolean(value))
    )
  );

  let lastError: unknown = null;

  for (const path of paths) {
    try {
      return await fetchJson<JsonRecord>(`${normalizedBaseUrl}${path}`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error('Twitter preview provider did not return data.');
};

const getTwitterBaseUrls = () =>
  Array.from(
    new Set(
      [
        process.env.FXEMBED_PUBLIC_BASE_URL?.trim(),
        process.env.FXEMBED_FALLBACK_BASE_URL?.trim(),
        DEFAULT_FXEMBED_PUBLIC_BASE_URL,
        process.env.VXTWITTER_FALLBACK_BASE_URL?.trim(),
        DEFAULT_VXTWITTER_PUBLIC_BASE_URL,
      ].filter((value): value is string => Boolean(value))
    )
  );

const fetchTwitterPreviewDirect = async (
  sourceUrl: string
): Promise<MediaPreview> => {
  const statusId = parseTwitterStatusId(sourceUrl);
  const handle = parseTwitterHandle(sourceUrl);

  if (!statusId) {
    throw new Error('Twitter status ID could not be parsed.');
  }

  let lastError: unknown = null;

  for (const baseUrl of getTwitterBaseUrls()) {
    try {
      const payload = await fetchTwitterApiPayload(baseUrl, statusId, handle);
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
        authorName:
          asStringOrNull(author?.name) ?? asStringOrNull(tweet.user_name),
        canonicalUrl:
          asStringOrNull(tweet.url) ??
          asStringOrNull(tweet.tweetURL) ??
          sourceUrl,
        likes: asNumberOrNull(tweet.likes),
        media: normalizeTwitterPreviewMedia(allMedia),
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
        title: text?.split('\n').find(Boolean)?.slice(0, 240) ?? 'Twitter post',
        translatedText: null,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error('Twitter preview provider did not return data.');
};

const getMessageFromPayload = (payload: unknown) => {
  if (typeof payload === 'string') {
    return payload;
  }

  if (payload && typeof payload === 'object') {
    const maybePayload = payload as { error?: unknown; message?: unknown };

    if (typeof maybePayload.message === 'string') {
      return maybePayload.message;
    }

    if (typeof maybePayload.error === 'string') {
      return maybePayload.error;
    }
  }

  return null;
};

export const getMediaPreview = async (
  sourceUrl: string
): Promise<MediaPreview> => {
  if (inferPlatformFromUrl(sourceUrl) === 'Twitter') {
    try {
      return await fetchTwitterPreviewDirect(sourceUrl);
    } catch {
      // Fall back to the shared worker for consistency if direct providers fail.
    }
  }

  if (!isMediaWorkerConfigured()) {
    return toMinimalPreview(sourceUrl);
  }

  const payload = await postWorker<Partial<MediaPreview>>('/v1/preview', {
    sourceUrl,
  });

  return {
    authorAvatarUrl: asStringOrNull(payload.authorAvatarUrl),
    authorHandle: asStringOrNull(payload.authorHandle),
    authorName: asStringOrNull(payload.authorName),
    canonicalUrl: asStringOrNull(payload.canonicalUrl) ?? sourceUrl,
    likes: asNumberOrNull(payload.likes),
    media: normalizePreviewMedia(payload.media),
    platform:
      asStringOrNull(payload.platform) ?? inferPlatformFromUrl(sourceUrl),
    publishedAt: asStringOrNull(payload.publishedAt),
    replies: asNumberOrNull(payload.replies),
    reposts: asNumberOrNull(payload.reposts),
    sensitive: Boolean(payload.sensitive),
    sourceUrl: asStringOrNull(payload.sourceUrl) ?? sourceUrl,
    text: asStringOrNull(payload.text),
    title: asStringOrNull(payload.title),
    translatedText: asStringOrNull(payload.translatedText),
  };
};

export const translateMediaText = async (params: {
  sourceUrl: string;
  targetLanguage: string;
  text: string;
}): Promise<TranslateMediaTextResult> => {
  const payload = await postWorker<Partial<TranslateMediaTextResult>>(
    '/v1/translate',
    params
  );

  if (typeof payload.translatedText !== 'string' || !payload.translatedText) {
    throw new Error('Translate API did not return translated text.');
  }

  return {
    provider: asStringOrNull(payload.provider),
    translatedText: payload.translatedText,
  };
};

export const createMediaGif = async (params: {
  channelId: string | null;
  guildId: string | null;
  mediaUrl: string;
  requesterId: string;
  sourceUrl: string;
}): Promise<MediaGifResult> => {
  if (!isMediaWorkerConfigured()) {
    return {
      expiresAt: null,
      gifUrl: null,
      message: 'Media worker is not configured yet.',
      provider: null,
      status: 'error',
    };
  }

  try {
    const payload = await postWorker<Partial<MediaGifResult>>(
      '/v1/gif',
      params
    );

    if (payload.status !== 'ready' && payload.status !== 'queued') {
      return {
        expiresAt: null,
        gifUrl: null,
        message:
          asStringOrNull(payload.message) ??
          'Unable to convert this media to GIF right now.',
        provider: asStringOrNull(payload.provider),
        status: 'error',
      };
    }

    return {
      expiresAt: asStringOrNull(payload.expiresAt),
      gifUrl: asStringOrNull(payload.gifUrl),
      message: asStringOrNull(payload.message),
      provider: asStringOrNull(payload.provider),
      status: payload.status,
    };
  } catch (error) {
    if (error instanceof MediaWorkerHttpError) {
      return {
        expiresAt: null,
        gifUrl: null,
        message:
          getMessageFromPayload(error.payload) ??
          `Media worker request failed (${error.status})`,
        provider: null,
        status: 'error',
      };
    }

    const maybeError = error as { message?: string; name?: string };
    const isAbortError =
      maybeError.name === 'AbortError' ||
      maybeError.message?.toLowerCase().includes('aborted');

    return {
      expiresAt: null,
      gifUrl: null,
      message: isAbortError
        ? 'Media worker request timed out.'
        : (maybeError.message ?? 'Media worker request failed.'),
      provider: null,
      status: 'error',
    };
  }
};
