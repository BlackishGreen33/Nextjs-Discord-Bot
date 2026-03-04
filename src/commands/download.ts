import { SlashCommandBuilder } from '@discordjs/builders';
import type { APIInteractionResponse } from 'discord-api-types/v10';

import type { executeCommand } from '@/common/types';
import {
  buildMediaButtonCustomId,
  getMediaPreview,
  normalizeMediaUrl,
} from '@/common/utils';

const MESSAGE_WITH_SOURCE = 4;
const EPHEMERAL_FLAG = 64;
const ACTION_ROW_TYPE = 1;
const BUTTON_TYPE = 2;
const BUTTON_STYLE_PRIMARY = 1;
const BUTTON_STYLE_DANGER = 4;
const MAX_TEXT_LENGTH = 220;

const toEphemeralMessage = (content: string): APIInteractionResponse => ({
  data: {
    content,
    flags: EPHEMERAL_FLAG,
  },
  type: MESSAGE_WITH_SOURCE,
});

const trimText = (value: string | null) => {
  if (!value) {
    return null;
  }

  const normalized = value.trim();

  if (normalized.length <= MAX_TEXT_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_TEXT_LENGTH - 3)}...`;
};

const formatCount = (value: number | null) => {
  if (value === null || Number.isNaN(value)) {
    return '-';
  }

  return new Intl.NumberFormat('en-US').format(value);
};

const formatPublishedAt = (value: string | null) => {
  if (!value) {
    return 'Unknown time';
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return new Date(timestamp).toLocaleString('en-US', {
    hour12: false,
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const createButtons = (ownerId: string) => ({
  components: [
    {
      custom_id: buildMediaButtonCustomId('video', ownerId),
      label: 'Download Video',
      style: BUTTON_STYLE_PRIMARY,
      type: BUTTON_TYPE,
    },
    {
      custom_id: buildMediaButtonCustomId('audio', ownerId),
      label: 'Download Audio',
      style: BUTTON_STYLE_PRIMARY,
      type: BUTTON_TYPE,
    },
    {
      custom_id: buildMediaButtonCustomId('delete', ownerId),
      label: 'Delete',
      style: BUTTON_STYLE_DANGER,
      type: BUTTON_TYPE,
    },
  ],
  type: ACTION_ROW_TYPE,
});

const getUrlOption = (interaction: Parameters<executeCommand>[0]) => {
  const options = (
    interaction.data as { options?: Array<{ name?: string; value?: unknown }> }
  ).options;

  if (!Array.isArray(options)) {
    return null;
  }

  const matched = options.find((option) => option.name === 'url');

  if (!matched || typeof matched.value !== 'string') {
    return null;
  }

  return matched.value;
};

export const register = new SlashCommandBuilder()
  .setName('download')
  .setDescription('Create media download card from a post URL')
  .addStringOption((option) =>
    option
      .setName('url')
      .setDescription('Supported media post URL')
      .setRequired(true)
  );

export const execute: executeCommand = async (interaction) => {
  const inputUrl = getUrlOption(interaction);

  if (!inputUrl) {
    return toEphemeralMessage('Please provide a valid URL.');
  }

  const sourceUrl = normalizeMediaUrl(inputUrl);

  if (!sourceUrl) {
    return toEphemeralMessage(
      'Unsupported URL. Check MEDIA_ALLOWED_DOMAINS and try again.'
    );
  }

  const ownerId =
    interaction.member?.user?.id ?? interaction.user?.id ?? 'unknown';

  try {
    const preview = await getMediaPreview(sourceUrl);

    const title = trimText(preview.title) ?? `${preview.platform} media`;
    const text = trimText(preview.text);
    const author =
      preview.authorHandle && preview.authorName
        ? `${preview.authorName} (${preview.authorHandle})`
        : (preview.authorName ?? preview.authorHandle ?? 'Unknown author');

    const fields = [
      {
        inline: true,
        name: 'Replies',
        value: formatCount(preview.replies ?? null),
      },
      {
        inline: true,
        name: 'Reposts',
        value: formatCount(preview.reposts),
      },
      {
        inline: true,
        name: 'Likes',
        value: formatCount(preview.likes),
      },
    ];

    return {
      data: {
        components: [createButtons(ownerId)],
        content: sourceUrl,
        embeds: [
          {
            color: 0x1d9bf0,
            description: text ?? 'No description available.',
            fields,
            footer: {
              text: `Published: ${formatPublishedAt(preview.publishedAt)}`,
            },
            image: preview.thumbnailUrl
              ? {
                  url: preview.thumbnailUrl,
                }
              : undefined,
            title,
            url: sourceUrl,
            author: {
              name: `${preview.platform} | ${author}`,
            },
          },
        ],
      },
      type: MESSAGE_WITH_SOURCE,
    };
  } catch {
    return toEphemeralMessage(
      'Failed to fetch media preview. Please try again later.'
    );
  }
};
