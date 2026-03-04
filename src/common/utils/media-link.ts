const MEDIA_BUTTON_PREFIX = 'dl:v1';

type MediaButtonAction = 'audio' | 'delete' | 'video';

const DEFAULT_ALLOWED_DOMAINS = [
  'x.com',
  'twitter.com',
  'youtube.com',
  'youtu.be',
  'instagram.com',
  'facebook.com',
  'fb.watch',
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

const URL_REGEX = /https?:\/\/[^\s<>"']+/gi;

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

    if (hostname === 'youtube.com' || hostname.endsWith('.youtube.com')) {
      return 'YouTube';
    }

    if (hostname === 'youtu.be' || hostname.endsWith('.youtu.be')) {
      return 'YouTube';
    }

    if (hostname === 'instagram.com' || hostname.endsWith('.instagram.com')) {
      return 'Instagram';
    }

    if (hostname === 'facebook.com' || hostname.endsWith('.facebook.com')) {
      return 'Facebook';
    }

    if (hostname === 'fb.watch' || hostname.endsWith('.fb.watch')) {
      return 'Facebook';
    }

    return hostname;
  } catch {
    return 'Unknown';
  }
};

export const buildMediaButtonCustomId = (
  action: MediaButtonAction,
  ownerUserId: string
) => `${MEDIA_BUTTON_PREFIX}:${action}:${ownerUserId}`;

export const parseMediaButtonCustomId = (value: string) => {
  const parts = value.split(':');

  if (parts.length !== 4) {
    return null;
  }

  const [prefixA, prefixB, action, ownerUserId] = parts;

  if (`${prefixA}:${prefixB}` !== MEDIA_BUTTON_PREFIX) {
    return null;
  }

  if (!['video', 'audio', 'delete'].includes(action)) {
    return null;
  }

  if (!ownerUserId || ownerUserId.trim().length === 0) {
    return null;
  }

  return {
    action: action as MediaButtonAction,
    ownerUserId,
  };
};
