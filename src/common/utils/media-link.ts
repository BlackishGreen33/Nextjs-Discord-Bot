const PREVIEW_ACTION_PREFIX = 'pv:v1';
const URL_REGEX = /https?:\/\/[^\s<>"']+/gi;

export type PreviewAction = 'gif' | 'retract' | 'translate';

const DEFAULT_ALLOWED_DOMAINS = [
  'bsky.app',
  'pixiv.net',
  'twitter.com',
  'www.pixiv.net',
  'x.com',
];

const getAllowedDomains = () => {
  const rawValue = process.env.MEDIA_ALLOWED_DOMAINS;

  if (!rawValue || rawValue.trim().length === 0) {
    return DEFAULT_ALLOWED_DOMAINS;
  }

  return rawValue
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter((domain) => domain.length > 0);
};

export const isSupportedMediaDomain = (hostname: string) => {
  const normalizedHost = hostname.toLowerCase();
  const allowedDomains = getAllowedDomains();

  return allowedDomains.some(
    (domain) =>
      normalizedHost === domain || normalizedHost.endsWith(`.${domain}`)
  );
};

export const normalizeMediaUrl = (value: string) => {
  let parsed: URL;

  try {
    parsed = new URL(value.trim());
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return null;
  }

  if (!isSupportedMediaDomain(parsed.hostname)) {
    return null;
  }

  return parsed.toString();
};

export const extractFirstSupportedMediaUrl = (content: string) => {
  const candidates = content.match(URL_REGEX) ?? [];

  for (const candidate of candidates) {
    const normalized = normalizeMediaUrl(candidate);

    if (normalized) {
      return normalized;
    }
  }

  return null;
};

export const inferPlatformFromUrl = (url: string) => {
  try {
    const hostname = new URL(url).hostname.toLowerCase();

    if (hostname === 'x.com' || hostname.endsWith('.x.com')) {
      return 'Twitter';
    }

    if (hostname === 'twitter.com' || hostname.endsWith('.twitter.com')) {
      return 'Twitter';
    }

    if (hostname === 'pixiv.net' || hostname.endsWith('.pixiv.net')) {
      return 'Pixiv';
    }

    if (hostname === 'bsky.app' || hostname.endsWith('.bsky.app')) {
      return 'Bluesky';
    }

    return hostname;
  } catch {
    return 'Unknown';
  }
};

export const parseTwitterStatusId = (url: string) => {
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

export const parsePixivArtworkId = (url: string) => {
  try {
    const parsed = new URL(url);
    const pathnameMatch = parsed.pathname.match(/\/artworks\/(\d+)/);

    if (pathnameMatch?.[1]) {
      return pathnameMatch[1];
    }

    const queryValue = parsed.searchParams.get('illust_id');
    return queryValue && /^\d+$/.test(queryValue) ? queryValue : null;
  } catch {
    return null;
  }
};

export const parseBlueskyPostUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);

    if (segments.length < 4) {
      return null;
    }

    if (segments[0] !== 'profile' || segments[2] !== 'post') {
      return null;
    }

    const handle = segments[1];
    const rkey = segments[3];

    if (!handle || !rkey) {
      return null;
    }

    return {
      handle,
      rkey,
    };
  } catch {
    return null;
  }
};

export const buildPreviewActionCustomId = (
  action: PreviewAction,
  ownerUserId: string,
  sourceMessageId: string
) => `${PREVIEW_ACTION_PREFIX}:${action}:${ownerUserId}:${sourceMessageId}`;

export const parsePreviewActionCustomId = (value: string) => {
  const parts = value.split(':');

  if (parts.length !== 5) {
    return null;
  }

  const [prefixA, prefixB, action, ownerUserId, sourceMessageId] = parts;

  if (`${prefixA}:${prefixB}` !== PREVIEW_ACTION_PREFIX) {
    return null;
  }

  if (!['translate', 'gif', 'retract'].includes(action)) {
    return null;
  }

  if (!ownerUserId || !sourceMessageId) {
    return null;
  }

  return {
    action: action as PreviewAction,
    ownerUserId,
    sourceMessageId,
  };
};
