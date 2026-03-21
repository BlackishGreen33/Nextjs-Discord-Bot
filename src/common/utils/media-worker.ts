import {
  getGifMode,
  getGifServiceBaseUrl,
  getGifServiceToken,
  getMediaMode,
  getMediaServiceBaseUrl,
  getMediaServiceToken,
  getMediaTimeoutMs,
  hasRemoteMediaServiceConfig,
  isTranslateFeatureAvailable,
} from '@/common/configs/deployment';

import {
  createMinimalPreview,
  fetchEmbeddedPreview,
  translateMediaTextEmbedded,
} from './media-core';
import { inferPlatformFromUrl } from './media-link';
import type {
  MediaGifResult,
  MediaPreview,
  MediaPreviewItem,
  TranslateMediaTextResult,
} from './media-types';

export type {
  MediaGifResult,
  MediaPreview,
  MediaPreviewItem,
  TranslateMediaTextResult,
};

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

export const isMediaWorkerConfigured = () => hasRemoteMediaServiceConfig();

const postJson = async <T>(
  baseUrl: string,
  path: string,
  body: object,
  token?: string
): Promise<T> => {
  if (!baseUrl) {
    throw new Error('Remote service base URL is not configured');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), getMediaTimeoutMs());

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        ...(token
          ? {
              Authorization: `Bearer ${token}`,
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

const asStringOrNull = (value: unknown) =>
  typeof value === 'string' && value.length > 0 ? value : null;

const asNumberOrNull = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

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
  const mediaMode = getMediaMode();

  if (mediaMode === 'disabled') {
    return createMinimalPreview(sourceUrl);
  }

  if (mediaMode === 'remote') {
    const payload = await postJson<Partial<MediaPreview>>(
      getMediaServiceBaseUrl(),
      '/v1/preview',
      {
        sourceUrl,
      },
      getMediaServiceToken()
    );

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
  }

  return fetchEmbeddedPreview(sourceUrl);
};

export const translateMediaText = async (params: {
  sourceUrl: string;
  targetLanguage: string;
  text: string;
}): Promise<TranslateMediaTextResult> => {
  if (getMediaMode() === 'remote') {
    const payload = await postJson<Partial<TranslateMediaTextResult>>(
      getMediaServiceBaseUrl(),
      '/v1/translate',
      params,
      getMediaServiceToken()
    );

    if (typeof payload.translatedText !== 'string' || !payload.translatedText) {
      throw new Error('Translate API did not return translated text.');
    }

    return {
      provider: asStringOrNull(payload.provider),
      translatedText: payload.translatedText,
    };
  }

  if (!isTranslateFeatureAvailable()) {
    throw new Error('Translate service is not configured.');
  }

  return translateMediaTextEmbedded({
    targetLanguage: params.targetLanguage,
    text: params.text,
  });
};

const postGifService = async (params: {
  channelId: string | null;
  guildId: string | null;
  mediaUrl: string;
  requesterId: string;
  sourceUrl: string;
}) => {
  const response = await postJson<Partial<MediaGifResult>>(
    getGifServiceBaseUrl(),
    '/v1/gif',
    params,
    getGifServiceToken()
  );

  if (response.status !== 'ready' && response.status !== 'queued') {
    return {
      expiresAt: null,
      gifUrl: null,
      message:
        asStringOrNull(response.message) ??
        'Unable to convert this media to GIF right now.',
      provider: asStringOrNull(response.provider),
      status: 'error' as const,
    };
  }

  return {
    expiresAt: asStringOrNull(response.expiresAt),
    gifUrl: asStringOrNull(response.gifUrl),
    message: asStringOrNull(response.message),
    provider: asStringOrNull(response.provider),
    status: response.status,
  };
};

export const createMediaGif = async (params: {
  channelId: string | null;
  guildId: string | null;
  mediaUrl: string;
  requesterId: string;
  sourceUrl: string;
}): Promise<MediaGifResult> => {
  if (getMediaMode() === 'remote') {
    try {
      return await postJson<Partial<MediaGifResult>>(
        getMediaServiceBaseUrl(),
        '/v1/gif',
        params,
        getMediaServiceToken()
      ).then((payload) => {
        if (payload.status !== 'ready' && payload.status !== 'queued') {
          return {
            expiresAt: null,
            gifUrl: null,
            message:
              asStringOrNull(payload.message) ??
              'Unable to convert this media to GIF right now.',
            provider: asStringOrNull(payload.provider),
            status: 'error' as const,
          };
        }

        return {
          expiresAt: asStringOrNull(payload.expiresAt),
          gifUrl: asStringOrNull(payload.gifUrl),
          message: asStringOrNull(payload.message),
          provider: asStringOrNull(payload.provider),
          status: payload.status,
        };
      });
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
  }

  if (getGifMode() !== 'remote') {
    return {
      expiresAt: null,
      gifUrl: null,
      message: 'GIF service is not configured yet.',
      provider: null,
      status: 'error',
    };
  }

  try {
    return await postGifService(params);
  } catch (error) {
    if (error instanceof MediaWorkerHttpError) {
      return {
        expiresAt: null,
        gifUrl: null,
        message:
          getMessageFromPayload(error.payload) ??
          `GIF service request failed (${error.status})`,
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
        ? 'GIF service request timed out.'
        : (maybeError.message ?? 'GIF service request failed.'),
      provider: null,
      status: 'error',
    };
  }
};
