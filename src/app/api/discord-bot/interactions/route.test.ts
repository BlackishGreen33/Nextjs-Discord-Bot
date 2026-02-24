import { InteractionType } from 'discord-api-types/v10';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyInteractionRequestMock = vi.fn();
const getCommandsMock = vi.fn();

vi.mock('@/common/configs', () => ({
  PUBLIC_KEY: 'test-public-key',
}));

vi.mock('@/common/utils', () => ({
  getCommands: (...args: unknown[]) => getCommandsMock(...args),
  verifyInteractionRequest: (...args: unknown[]) =>
    verifyInteractionRequestMock(...args),
}));

import { POST } from './route';

const buildRequest = () =>
  new Request('http://localhost/api/discord-bot/interactions', {
    body: '{}',
    method: 'POST',
  });

describe('POST /api/discord-bot/interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when request signature is invalid', async () => {
    verifyInteractionRequestMock.mockResolvedValue({ isValid: false });

    const response = await POST(buildRequest());

    expect(response.status).toBe(401);
    expect(await response.text()).toBe('Invalid request');
  });

  it('returns pong response for Discord ping interactions', async () => {
    verifyInteractionRequestMock.mockResolvedValue({
      interaction: { type: InteractionType.Ping },
      isValid: true,
    });

    const response = await POST(buildRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ type: 1 });
    expect(getCommandsMock).not.toHaveBeenCalled();
  });

  it('returns an ephemeral error when command is unknown', async () => {
    verifyInteractionRequestMock.mockResolvedValue({
      interaction: {
        data: { name: 'missing-command' },
        type: InteractionType.ApplicationCommand,
      },
      isValid: true,
    });
    getCommandsMock.mockResolvedValue({});

    const response = await POST(buildRequest());
    const body = (await response.json()) as {
      data: { content: string; flags: number };
      type: number;
    };

    expect(response.status).toBe(200);
    expect(body.type).toBe(4);
    expect(body.data.flags).toBe(64);
    expect(body.data.content).toContain('/missing-command');
  });
});
