import type { RESTGetAPIApplicationCommandsResult } from 'discord-api-types/v10';

import { BOT_TOKEN } from '../configs';

const DISCORD_API_BASE_URL = 'https://discord.com/api';
const REQUEST_TIMEOUT_MS = 5000;
const MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 250;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

class DiscordApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'DiscordApiError';
    this.status = status;
  }
}

type DiscordApiResponse<T> = {
  data: T;
  status: number;
};

const request = async <T>(
  path: string,
  init: RequestInit
): Promise<DiscordApiResponse<T>> => {
  let networkError: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${DISCORD_API_BASE_URL}${path}`, {
        ...init,
        headers: {
          Authorization: `Bot ${BOT_TOKEN}`,
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const text = await response.text();
      const data = text.length > 0 ? (JSON.parse(text) as T) : ({} as T);

      if (!response.ok) {
        if (attempt < MAX_RETRIES && RETRYABLE_STATUSES.has(response.status)) {
          const retryAfterSeconds = Number(response.headers.get('Retry-After'));
          const retryDelayMs =
            Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
              ? retryAfterSeconds * 1000
              : BASE_RETRY_DELAY_MS * (attempt + 1);
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
          continue;
        }

        throw new DiscordApiError(
          `Discord API request failed with status ${response.status}`,
          response.status
        );
      }

      return {
        data,
        status: response.status,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      networkError = error;
      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) =>
          setTimeout(resolve, BASE_RETRY_DELAY_MS * (attempt + 1))
        );
        continue;
      }
    }
  }

  const maybeError = networkError as { message?: string };
  throw new DiscordApiError(
    maybeError?.message ?? 'Discord API request failed',
    0
  );
};

export const discord_api = {
  get: <T>(path: string) =>
    request<T>(path, {
      method: 'GET',
    }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, {
      body: JSON.stringify(body),
      method: 'PUT',
    }),
};

const fetchBotCommands = async () =>
  discord_api.get<RESTGetAPIApplicationCommandsResult>(
    `/applications/${process.env.NEXT_PUBLIC_APPLICATION_ID!}/commands`
  );

export default fetchBotCommands;
