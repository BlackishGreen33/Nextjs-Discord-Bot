import crypto from 'node:crypto';

export const extractBearerToken = (authorizationHeader: string | null) => {
  if (!authorizationHeader) return null;
  const bearerPrefix = 'Bearer ';
  if (!authorizationHeader.startsWith(bearerPrefix)) return null;
  return authorizationHeader.slice(bearerPrefix.length);
};

export const timingSafeEqualString = (
  expected: string,
  actual: string | null
) => {
  if (!actual) return false;

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  if (expectedBuffer.length !== actualBuffer.length) return false;

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
};
