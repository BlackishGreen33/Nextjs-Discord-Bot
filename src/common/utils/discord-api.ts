import type { RESTGetAPIApplicationCommandsResult } from 'discord-api-types/v10';

import { BOT_TOKEN } from '../configs';

const DISCORD_API_BASE_URL = 'https://discord.com/api';

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
  const response = await fetch(`${DISCORD_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  const data = text.length > 0 ? (JSON.parse(text) as T) : ({} as T);

  if (!response.ok) {
    throw new DiscordApiError(
      `Discord API request failed with status ${response.status}`,
      response.status
    );
  }

  return {
    data,
    status: response.status,
  };
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
