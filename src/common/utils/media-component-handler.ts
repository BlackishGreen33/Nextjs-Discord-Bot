import { APIInteractionResponse } from 'discord-api-types/v10';

import {
  extractFirstSupportedMediaUrl,
  parseMediaButtonCustomId,
} from './media-link';
import { createMediaDownload } from './media-worker';

const EPHEMERAL_FLAG = 64;
const MESSAGE_WITH_SOURCE = 4;
const UPDATE_MESSAGE = 7;
const BUTTON_TYPE = 2;
const MANAGE_GUILD_PERMISSION = BigInt(1) << BigInt(5);
const ADMINISTRATOR_PERMISSION = BigInt(1) << BigInt(3);

type MessageComponentInteraction = {
  channel_id?: string;
  data: {
    component_type?: number;
    custom_id?: string;
  };
  guild_id?: string;
  member?: {
    permissions?: string;
    user?: {
      id?: string;
    };
  };
  message?: {
    content?: string;
    embeds?: Array<{
      url?: string;
    }>;
  };
  user?: {
    id?: string;
  };
};

const toEphemeralMessage = (content: string): APIInteractionResponse => ({
  data: {
    content,
    flags: EPHEMERAL_FLAG,
  },
  type: MESSAGE_WITH_SOURCE,
});

const toChannelMessage = (content: string): APIInteractionResponse => ({
  data: {
    content,
  },
  type: MESSAGE_WITH_SOURCE,
});

const getRequesterId = (interaction: MessageComponentInteraction) =>
  interaction.member?.user?.id ?? interaction.user?.id ?? 'unknown';

const getPermissionBits = (interaction: MessageComponentInteraction) => {
  const rawPermission = interaction.member?.permissions;

  if (!rawPermission) {
    return null;
  }

  try {
    return BigInt(rawPermission);
  } catch {
    return null;
  }
};

const hasDeletePermission = (interaction: MessageComponentInteraction) => {
  const bits = getPermissionBits(interaction);

  if (bits === null) {
    return false;
  }

  return (
    (bits & (MANAGE_GUILD_PERMISSION | ADMINISTRATOR_PERMISSION)) !== BigInt(0)
  );
};

const extractSourceUrlFromMessage = (
  interaction: MessageComponentInteraction
) => {
  const embedUrl = interaction.message?.embeds?.[0]?.url;

  if (typeof embedUrl === 'string' && embedUrl.length > 0) {
    return embedUrl;
  }

  const content = interaction.message?.content;

  if (typeof content === 'string' && content.length > 0) {
    return extractFirstSupportedMediaUrl(content);
  }

  return null;
};

export const handleMediaButtonInteraction = async (
  interaction: MessageComponentInteraction
): Promise<APIInteractionResponse> => {
  if (interaction.data.component_type !== BUTTON_TYPE) {
    return toEphemeralMessage('Unsupported component type.');
  }

  const customId = interaction.data.custom_id;

  if (!customId) {
    return toEphemeralMessage('Missing action id.');
  }

  const parsed = parseMediaButtonCustomId(customId);

  if (!parsed) {
    return toEphemeralMessage('Unsupported action id.');
  }

  const requesterId = getRequesterId(interaction);

  if (parsed.action === 'delete') {
    const allowed =
      requesterId === parsed.ownerUserId || hasDeletePermission(interaction);

    if (!allowed) {
      return toEphemeralMessage(
        'Only the requester or admins can delete this card.'
      );
    }

    return {
      data: {
        components: [],
        content: 'This media card was removed.',
        embeds: [],
      },
      type: UPDATE_MESSAGE,
    };
  }

  const sourceUrl = extractSourceUrlFromMessage(interaction);

  if (!sourceUrl) {
    return toEphemeralMessage('Media source URL not found on this card.');
  }

  try {
    const result = await createMediaDownload({
      channelId: interaction.channel_id ?? null,
      guildId: interaction.guild_id ?? null,
      requesterId,
      sourceUrl,
      type: parsed.action,
    });

    if (result.status === 'queued') {
      return toEphemeralMessage(
        result.message ?? 'Request accepted. Media is being prepared.'
      );
    }

    if (result.status === 'ready' && result.mediaUrl) {
      const expirationText = result.expiresAt
        ? `\nExpires at: ${result.expiresAt}`
        : '';
      const providerText = result.provider
        ? `\nProvider: ${result.provider}`
        : '';
      const filenameText = result.filename ? `\nFile: ${result.filename}` : '';

      return toChannelMessage(
        `Download ready (${parsed.action})\n${result.mediaUrl}${filenameText}${providerText}${expirationText}`
      );
    }

    return toEphemeralMessage(
      result.message ?? 'Failed to prepare media download.'
    );
  } catch {
    return toEphemeralMessage(
      'Download request failed. Please try again later.'
    );
  }
};
