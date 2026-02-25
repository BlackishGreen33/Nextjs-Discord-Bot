type LoggerPayload = {
  [key: string]: unknown;
};

const getClientIp = (req: Request) => {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }
  return req.headers.get('x-real-ip') ?? 'unknown';
};

const getRequestId = (req: Request) =>
  req.headers.get('x-request-id') ?? crypto.randomUUID();

export const createRequestLogger = (route: string, req: Request) => {
  const startedAt = Date.now();
  const ip = getClientIp(req);
  const requestId = getRequestId(req);

  const log = (event: string, payload?: LoggerPayload) => {
    process.stdout.write(
      `[${route}] ${JSON.stringify({
        durationMs: Date.now() - startedAt,
        event,
        ip,
        requestId,
        ts: new Date().toISOString(),
        ...(payload ?? {}),
      })}\n`
    );
  };

  return {
    ip,
    log,
    requestId,
  };
};
