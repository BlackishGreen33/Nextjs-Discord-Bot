import type { GuildSettings } from '@/common/stores';

import { discord_api } from './discord-api';

type SettingsActorInteraction = {
  guild_id?: string;
  member?: {
    nick?: string | null;
    user?: {
      global_name?: string | null;
      id?: string;
      username?: string;
    };
  };
  user?: {
    global_name?: string | null;
    id?: string;
    username?: string;
  };
};

type DiscordGuildMemberResponse = {
  nick?: string | null;
  user?: {
    global_name?: string | null;
    id?: string;
    username?: string;
  };
};

const RAW_DISCORD_USER_ID_PATTERN = /^\d{5,}$/;

const trimDisplayValue = (value: string | null | undefined) => {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 64) : null;
};

const getDisplayName = (source: {
  nick?: string | null;
  user?: {
    global_name?: string | null;
    username?: string;
  };
}) =>
  trimDisplayValue(source.nick) ??
  trimDisplayValue(source.user?.global_name) ??
  trimDisplayValue(source.user?.username);

const getRequesterId = (interaction: SettingsActorInteraction) =>
  interaction.member?.user?.id ?? interaction.user?.id ?? 'unknown';

export const getRequesterLabel = (interaction: SettingsActorInteraction) => {
  const requesterId = getRequesterId(interaction);
  const displayName =
    getDisplayName(interaction.member ?? {}) ??
    trimDisplayValue(interaction.user?.global_name) ??
    trimDisplayValue(interaction.user?.username);

  if (!displayName || requesterId === 'unknown') {
    return requesterId;
  }

  return `${displayName} (${requesterId})`;
};

const resolveUpdatedByLabel = async (guildId: string, updatedBy: string) => {
  if (!RAW_DISCORD_USER_ID_PATTERN.test(updatedBy)) {
    return updatedBy;
  }

  try {
    const response = await discord_api.get<DiscordGuildMemberResponse>(
      `/guilds/${guildId}/members/${updatedBy}`
    );
    const displayName = getDisplayName(response.data ?? {});

    if (!displayName) {
      return updatedBy;
    }

    return `${displayName} (${updatedBy})`;
  } catch {
    return updatedBy;
  }
};

export const hydrateSettingsUpdatedBy = async (
  guildId: string | undefined,
  settings: GuildSettings
): Promise<GuildSettings> => {
  if (!guildId || !settings.updatedBy) {
    return settings;
  }

  const resolved = await resolveUpdatedByLabel(guildId, settings.updatedBy);

  if (resolved === settings.updatedBy) {
    return settings;
  }

  return {
    ...settings,
    updatedBy: resolved,
  };
};
