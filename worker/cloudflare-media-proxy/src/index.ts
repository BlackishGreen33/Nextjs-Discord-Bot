interface Env {
  COBALT_API_BASE_URL: string;
  COBALT_API_KEY?: string;
  FALLBACK_API_BASE_URL?: string;
  FALLBACK_API_TOKEN?: string;
  MEDIA_ALLOWED_DOMAINS?: string;
  WORKER_AUTH_TOKEN?: string;
}

type DownloadRequest = {
  channelId?: string | null;
  guildId?: string | null;
  requesterId?: string;
  sourceUrl?: string;
  type?: 'audio' | 'video';
};

type PreviewRequest = {
  sourceUrl?: string;
};

const DEFAULT_ALLOWED_DOMAINS = ['x.com', 'twitter.com'];

const createJsonResponse = (
  body: unknown,
  init?: ResponseInit,
  cors = false
) => {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');

  if (cors) {
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
};

const isAuthorized = (request: Request, env: Env) => {
  const requiredToken = env.WORKER_AUTH_TOKEN?.trim();

  if (!requiredToken) {
    return true;
  }

  const authHeader = request.headers.get('Authorization')?.trim();

  if (!authHeader) {
    return false;
  }

  const [scheme, token] = authHeader.split(' ');

  return scheme === 'Bearer' && token === requiredToken;
};

const normalizeAllowedDomains = (env: Env) => {
  const configured = env.MEDIA_ALLOWED_DOMAINS?.trim();

  if (!configured) {
    return DEFAULT_ALLOWED_DOMAINS;
  }

  return configured
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter((domain) => domain.length > 0);
};

const isAllowedDomain = (hostname: string, env: Env) => {
  const allowedDomains = normalizeAllowedDomains(env);

  return allowedDomains.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
  );
};

const normalizeSourceUrl = (value: string | undefined, env: Env) => {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value.trim());

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }

    if (!isAllowedDomain(parsed.hostname.toLowerCase(), env)) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
};

const inferPlatform = (sourceUrl: string) => {
  const hostname = new URL(sourceUrl).hostname.toLowerCase();

  if (hostname === 'x.com' || hostname.endsWith('.x.com')) {
    return 'Twitter';
  }

  if (hostname === 'twitter.com' || hostname.endsWith('.twitter.com')) {
    return 'Twitter';
  }

  if (hostname.includes('youtube')) {
    return 'YouTube';
  }

  if (hostname.includes('instagram')) {
    return 'Instagram';
  }

  if (hostname.includes('facebook') || hostname.includes('fb.watch')) {
    return 'Facebook';
  }

  return hostname;
};

const callCobalt = async (
  env: Env,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> => {
  const cobaltBaseUrl = env.COBALT_API_BASE_URL?.trim();

  if (!cobaltBaseUrl) {
    throw new Error('COBALT_API_BASE_URL is not configured');
  }

  const response = await fetch(`${cobaltBaseUrl.replace(/\/$/, '')}/`, {
    body: JSON.stringify(body),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(env.COBALT_API_KEY
        ? {
            Authorization: `Api-Key ${env.COBALT_API_KEY}`,
          }
        : {}),
    },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`cobalt request failed with status ${response.status}`);
  }

  return (await response.json()) as Record<string, unknown>;
};

const callFallback = async (
  env: Env,
  body: DownloadRequest
): Promise<Response | null> => {
  const fallbackBaseUrl = env.FALLBACK_API_BASE_URL?.trim();

  if (!fallbackBaseUrl) {
    return null;
  }

  const fallbackResponse = await fetch(
    `${fallbackBaseUrl.replace(/\/$/, '')}/v1/download`,
    {
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        ...(env.FALLBACK_API_TOKEN
          ? {
              Authorization: `Bearer ${env.FALLBACK_API_TOKEN}`,
            }
          : {}),
      },
      method: 'POST',
    }
  );

  return fallbackResponse;
};

const handlePreview = async (request: Request, env: Env) => {
  const payload = (await request.json()) as PreviewRequest;
  const sourceUrl = normalizeSourceUrl(payload.sourceUrl, env);

  if (!sourceUrl) {
    return createJsonResponse(
      {
        error: 'Invalid or unsupported source URL',
      },
      {
        status: 400,
      }
    );
  }

  return createJsonResponse({
    authorHandle: null,
    authorName: null,
    likes: null,
    platform: inferPlatform(sourceUrl),
    publishedAt: null,
    replies: null,
    reposts: null,
    sourceUrl,
    text: null,
    thumbnailUrl: null,
    title: null,
  });
};

const handleDownload = async (request: Request, env: Env) => {
  const payload = (await request.json()) as DownloadRequest;
  const sourceUrl = normalizeSourceUrl(payload.sourceUrl, env);

  if (!sourceUrl) {
    return createJsonResponse(
      {
        message: 'Invalid or unsupported source URL',
        status: 'error',
      },
      {
        status: 400,
      }
    );
  }

  const downloadType = payload.type === 'audio' ? 'audio' : 'video';

  try {
    const cobaltResponse = await callCobalt(env, {
      downloadMode: downloadType === 'audio' ? 'audio' : 'auto',
      filenameStyle: 'basic',
      url: sourceUrl,
    });

    const cobaltStatus =
      typeof cobaltResponse.status === 'string'
        ? cobaltResponse.status
        : 'error';

    if (
      (cobaltStatus === 'tunnel' || cobaltStatus === 'redirect') &&
      typeof cobaltResponse.url === 'string'
    ) {
      return createJsonResponse({
        expiresAt: null,
        filename:
          typeof cobaltResponse.filename === 'string'
            ? cobaltResponse.filename
            : null,
        mediaUrl: cobaltResponse.url,
        message: null,
        provider: 'cobalt',
        status: 'ready',
      });
    }
  } catch {
    // Continue to fallback.
  }

  const fallbackResponse = await callFallback(env, {
    ...payload,
    sourceUrl,
    type: downloadType,
  });

  if (fallbackResponse && fallbackResponse.ok) {
    const fallbackPayload = await fallbackResponse.json();

    return createJsonResponse(fallbackPayload);
  }

  return createJsonResponse(
    {
      message:
        'Download failed in cobalt and no successful fallback response was available.',
      status: 'error',
    },
    {
      status: 502,
    }
  );
};

const workerHandler = {
  async fetch(request: Request, env: Env) {
    if (request.method === 'OPTIONS') {
      return createJsonResponse({}, { status: 200 }, true);
    }

    if (!isAuthorized(request, env)) {
      return createJsonResponse(
        {
          error: 'Unauthorized',
        },
        {
          status: 401,
        }
      );
    }

    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/v1/preview') {
      return handlePreview(request, env);
    }

    if (request.method === 'POST' && url.pathname === '/v1/download') {
      return handleDownload(request, env);
    }

    return createJsonResponse(
      {
        error: 'Not found',
      },
      {
        status: 404,
      }
    );
  },
};

export default workerHandler;
