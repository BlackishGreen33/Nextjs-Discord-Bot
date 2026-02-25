import { describe, expect, it, vi } from 'vitest';

const naclVerifyMock = vi.fn();

vi.mock('tweetnacl', () => ({
  default: {
    sign: {
      detached: {
        verify: (...args: unknown[]) => naclVerifyMock(...args),
      },
    },
  },
}));

import verifyInteractionRequest from './verify-discord-request';

const buildRequest = (body: string) =>
  new Request('http://localhost/api/discord-bot/interactions', {
    body,
    headers: {
      'x-signature-ed25519': 'a'.repeat(128),
      'x-signature-timestamp': '1234567890',
    },
    method: 'POST',
  });

describe('verifyInteractionRequest', () => {
  it('returns invalid when body is malformed JSON even if signature verification passes', async () => {
    naclVerifyMock.mockReturnValue(true);

    const result = await verifyInteractionRequest(
      buildRequest('{'),
      'b'.repeat(64)
    );

    expect(result).toEqual({ isValid: false });
  });

  it('returns invalid when required signature headers are missing', async () => {
    const request = new Request(
      'http://localhost/api/discord-bot/interactions',
      {
        body: '{}',
        method: 'POST',
      }
    );

    const result = await verifyInteractionRequest(request, 'b'.repeat(64));

    expect(result).toEqual({ isValid: false });
  });
});
