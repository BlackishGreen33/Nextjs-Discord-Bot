import { inferPlatformFromUrl } from './media-link';

export type MediaPreview = {
  authorHandle: string | null;
  authorName: string | null;
  likes: number | null;
  platform: string;
  publishedAt: string | null;
  replies: number | null;
  reposts: number | null;
  sourceUrl: string;
  text: string | null;
  thumbnailUrl: string | null;
  title: string | null;
};

export type CreateMediaDownloadParams = {
  channelId: string | null;
  guildId: string | null;
  requesterId: string;
  sourceUrl: string;
  type: 'audio' | 'video';
};

export type MediaDownloadResult = {
  expiresAt: string | null;
  filename: string | null;
  mediaUrl: string | null;
  message: string | null;
  provider: string | null;
  status: 'error' | 'queued' | 'ready';
};

const DEFAULT_TIMEOUT_MS = 8000;

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
    const token = getWorkerToken();
    const response = await fetch(`${baseUrl}${path}`, {
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        ...(token.length > 0
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {}),
      },
      method: 'POST',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `Media worker request failed with status ${response.status}`
      );
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const getMediaPreview = async (
  sourceUrl: string
): Promise<MediaPreview> => {
  if (!isMediaWorkerConfigured()) {
    return {
      authorHandle: null,
      authorName: null,
      likes: null,
      platform: inferPlatformFromUrl(sourceUrl),
      publishedAt: null,
      replies: null,
      reposts: null,
      sourceUrl,
      text: null,
      thumbnailUrl: null,
      title: null,
    };
  }

  const payload = await postWorker<Partial<MediaPreview>>('/v1/preview', {
    sourceUrl,
  });

  return {
    authorHandle:
      typeof payload.authorHandle === 'string' ? payload.authorHandle : null,
    authorName:
      typeof payload.authorName === 'string' ? payload.authorName : null,
    likes: typeof payload.likes === 'number' ? payload.likes : null,
    platform:
      typeof payload.platform === 'string' && payload.platform.trim().length > 0
        ? payload.platform
        : inferPlatformFromUrl(sourceUrl),
    publishedAt:
      typeof payload.publishedAt === 'string' ? payload.publishedAt : null,
    replies: typeof payload.replies === 'number' ? payload.replies : null,
    reposts: typeof payload.reposts === 'number' ? payload.reposts : null,
    sourceUrl:
      typeof payload.sourceUrl === 'string' ? payload.sourceUrl : sourceUrl,
    text: typeof payload.text === 'string' ? payload.text : null,
    thumbnailUrl:
      typeof payload.thumbnailUrl === 'string' ? payload.thumbnailUrl : null,
    title: typeof payload.title === 'string' ? payload.title : null,
  };
};

export const createMediaDownload = async (
  params: CreateMediaDownloadParams
): Promise<MediaDownloadResult> => {
  if (!isMediaWorkerConfigured()) {
    return {
      expiresAt: null,
      filename: null,
      mediaUrl: null,
      message: 'Media worker is not configured yet.',
      provider: null,
      status: 'error',
    };
  }

  const payload = await postWorker<Partial<MediaDownloadResult>>(
    '/v1/download',
    {
      channelId: params.channelId,
      guildId: params.guildId,
      requesterId: params.requesterId,
      sourceUrl: params.sourceUrl,
      type: params.type,
    }
  );

  if (payload.status !== 'ready' && payload.status !== 'queued') {
    return {
      expiresAt: null,
      filename: null,
      mediaUrl: null,
      message:
        typeof payload.message === 'string'
          ? payload.message
          : 'Unable to prepare media download.',
      provider: typeof payload.provider === 'string' ? payload.provider : null,
      status: 'error',
    };
  }

  return {
    expiresAt: typeof payload.expiresAt === 'string' ? payload.expiresAt : null,
    filename: typeof payload.filename === 'string' ? payload.filename : null,
    mediaUrl: typeof payload.mediaUrl === 'string' ? payload.mediaUrl : null,
    message: typeof payload.message === 'string' ? payload.message : null,
    provider: typeof payload.provider === 'string' ? payload.provider : null,
    status: payload.status,
  };
};
