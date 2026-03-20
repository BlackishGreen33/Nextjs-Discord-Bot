import { AttachmentBuilder } from 'discord.js';

const DEFAULT_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_ATTACHMENT_MAX_ITEMS = 4;
const DEFAULT_ATTACHMENT_TIMEOUT_MS = 10000;

const EXTENSION_BY_CONTENT_TYPE = {
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeContentType = (value) =>
  typeof value === 'string' ? value.split(';')[0].trim().toLowerCase() : null;

const isRenderableContentType = (value) =>
  Boolean(value && (value.startsWith('image/') || value.startsWith('video/')));

const sanitizeBaseName = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'preview';

const getExtensionFromUrl = (value) => {
  try {
    const pathname = new URL(value).pathname;
    const match = pathname.match(/\.([a-z0-9]{2,5})$/i);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
};

const getAttachmentConfig = (env) => ({
  maxBytes: parsePositiveInt(
    env.GATEWAY_ATTACHMENT_MAX_BYTES,
    DEFAULT_ATTACHMENT_MAX_BYTES
  ),
  maxItems: parsePositiveInt(
    env.GATEWAY_ATTACHMENT_MAX_ITEMS,
    DEFAULT_ATTACHMENT_MAX_ITEMS
  ),
  timeoutMs: parsePositiveInt(
    env.GATEWAY_ATTACHMENT_TIMEOUT_MS,
    DEFAULT_ATTACHMENT_TIMEOUT_MS
  ),
});

const buildAttachmentName = ({ contentType, index, platform, sourceUrl, type }) => {
  const extension =
    EXTENSION_BY_CONTENT_TYPE[contentType] ??
    getExtensionFromUrl(sourceUrl) ??
    (type === 'video' ? 'mp4' : 'jpg');

  return `${sanitizeBaseName(platform)}-${index + 1}.${extension}`;
};

const readResponseBytes = async (response, maxBytes) => {
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.byteLength > maxBytes) {
      throw new Error('attachment exceeded size limit');
    }

    return buffer;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    total += value.byteLength;

    if (total > maxBytes) {
      throw new Error('attachment exceeded size limit');
    }

    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks);
};

const buildAttachmentFromMedia = async (
  mediaItem,
  index,
  platform,
  config,
  fetchImpl
) => {
  if (!mediaItem?.sourceUrl) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetchImpl(mediaItem.sourceUrl, {
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const contentType = normalizeContentType(response.headers.get('content-type'));

    if (!isRenderableContentType(contentType)) {
      return null;
    }

    const contentLength = Number.parseInt(
      response.headers.get('content-length') ?? '',
      10
    );

    if (Number.isFinite(contentLength) && contentLength > config.maxBytes) {
      return null;
    }

    const bytes = await readResponseBytes(response, config.maxBytes);

    return new AttachmentBuilder(bytes, {
      name: buildAttachmentName({
        contentType,
        index,
        platform,
        sourceUrl: mediaItem.sourceUrl,
        type: mediaItem.type,
      }),
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const buildPreviewFiles = async (
  preview,
  settings,
  env = process.env,
  fetchImpl = fetch
) => {
  if (settings?.autoPreview?.outputMode !== 'image') {
    return [];
  }

  if (preview?.sensitive && !settings?.autoPreview?.nsfwMode) {
    return [];
  }

  const config = getAttachmentConfig(env);
  const candidates = Array.isArray(preview?.media)
    ? preview.media
        .filter(
          (item) =>
            item &&
            typeof item.sourceUrl === 'string' &&
            item.sourceUrl.length > 0 &&
            (item.type === 'gif' || item.type === 'image' || item.type === 'video')
        )
        .slice(0, config.maxItems)
    : [];

  const files = await Promise.all(
    candidates.map((item, index) =>
      buildAttachmentFromMedia(item, index, preview.platform ?? 'preview', config, fetchImpl)
    )
  );

  return files.filter(Boolean);
};
