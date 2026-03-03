import { describe, expect, it } from 'vitest';

import { extractBearerToken, timingSafeEqualString } from './auth';

describe('auth helpers', () => {
  it('extractBearerToken returns token from a valid Bearer header', () => {
    expect(extractBearerToken('Bearer test-token')).toBe('test-token');
  });

  it('extractBearerToken returns null for invalid headers', () => {
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken('Basic abc')).toBeNull();
    expect(extractBearerToken('Bearer')).toBeNull();
  });

  it('timingSafeEqualString compares tokens safely', () => {
    expect(timingSafeEqualString('secret', 'secret')).toBe(true);
    expect(timingSafeEqualString('secret', 'SECRET')).toBe(false);
    expect(timingSafeEqualString('secret', 'short')).toBe(false);
    expect(timingSafeEqualString('secret', null)).toBe(false);
  });
});
