import type {
  APIActionRowComponent,
  APIButtonComponentWithCustomId,
  APIEmbed,
} from 'discord-api-types/v10';

import type { GuildSettings } from '@/common/stores';

import { buildPreviewActionCustomId } from './media-link';
import type { MediaPreview } from './media-worker';
import { formatUiDateTime, getUiText } from './ui-text';

const ACTION_ROW_TYPE = 1;
const BUTTON_STYLE_SECONDARY = 2;
const BUTTON_TYPE = 2;
const MAX_DESCRIPTION_LENGTH = 1100;
const MAX_TITLE_LENGTH = 240;

const trimText = (value: string | null | undefined, maxLength: number) => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    return null;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
};

const formatCount = (value: number | null | undefined) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-';
  }

  return new Intl.NumberFormat('en-US').format(value);
};

const createActionRow = (
  preview: MediaPreview,
  settings: GuildSettings,
  ownerUserId: string,
  sourceMessageId: string
): APIActionRowComponent<APIButtonComponentWithCustomId> | null => {
  const components: APIButtonComponentWithCustomId[] = [];

  if (settings.autoPreview.features.translate && trimText(preview.text, 200)) {
    components.push({
      custom_id: buildPreviewActionCustomId(
        'translate',
        ownerUserId,
        sourceMessageId
      ),
      emoji: { name: '🌐' },
      style: BUTTON_STYLE_SECONDARY,
      type: BUTTON_TYPE,
    });
  }

  if (
    settings.autoPreview.features.gif &&
    preview.media.some((item) => item.gifConvertible && item.sourceUrl)
  ) {
    components.push({
      custom_id: buildPreviewActionCustomId(
        'gif',
        ownerUserId,
        sourceMessageId
      ),
      emoji: { name: '🎬' },
      style: BUTTON_STYLE_SECONDARY,
      type: BUTTON_TYPE,
    });
  }

  components.push({
    custom_id: buildPreviewActionCustomId(
      'retract',
      ownerUserId,
      sourceMessageId
    ),
    emoji: { name: '🗑️' },
    style: BUTTON_STYLE_SECONDARY,
    type: BUTTON_TYPE,
  });

  return components.length > 0
    ? {
        components,
        type: ACTION_ROW_TYPE,
      }
    : null;
};

const buildDescription = (preview: MediaPreview, settings: GuildSettings) => {
  const text = getUiText(settings.autoPreview.translationTarget);
  const baseText = trimText(preview.text, MAX_DESCRIPTION_LENGTH);
  const translatedText = trimText(preview.translatedText, 700);

  if (preview.sensitive && !settings.autoPreview.nsfwMode) {
    const prefix = text.preview.sensitiveHidden;

    if (!baseText) {
      return prefix;
    }

    return `${prefix}\n\n${baseText}`;
  }

  if (baseText && translatedText) {
    return `${baseText}\n\n${text.preview.translatedLabel} (${settings.autoPreview.translationTarget})\n${translatedText}`;
  }

  if (translatedText) {
    return `${text.preview.translatedLabel} (${settings.autoPreview.translationTarget})\n${translatedText}`;
  }

  return baseText ?? null;
};

const buildPrimaryEmbed = (
  preview: MediaPreview,
  settings: GuildSettings
): APIEmbed => {
  const text = getUiText(settings.autoPreview.translationTarget);
  const authorName =
    preview.authorName || preview.authorHandle
      ? `${preview.authorName ?? ''} ${preview.authorHandle ? `(${preview.authorHandle})` : ''}`.trim()
      : text.common.unknownAuthor;
  const metrics = [
    {
      inline: true,
      name: text.preview.fields.replies,
      value: formatCount(preview.replies),
    },
    {
      inline: true,
      name: text.preview.fields.reposts,
      value: formatCount(preview.reposts),
    },
    {
      inline: true,
      name: text.preview.fields.likes,
      value: formatCount(preview.likes),
    },
  ];
  const mainMedia =
    preview.sensitive && !settings.autoPreview.nsfwMode
      ? null
      : (preview.media[0] ?? null);
  const embed: APIEmbed = {
    author: {
      icon_url: preview.authorAvatarUrl ?? undefined,
      name: `${preview.platform} | ${authorName}`,
    },
    color: 0x1d9bf0,
    description: buildDescription(preview, settings) ?? undefined,
    fields:
      settings.autoPreview.outputMode === 'embed' &&
      metrics.some((field) => field.value !== '-')
        ? metrics
        : undefined,
    footer: {
      text: formatUiDateTime(
        preview.publishedAt,
        settings.autoPreview.translationTarget
      )
        ? `${text.preview.footer.publishedAt}：${formatUiDateTime(preview.publishedAt, settings.autoPreview.translationTarget)}`
        : `${text.preview.footer.source}：${preview.platform}`,
    },
    title: trimText(preview.title, MAX_TITLE_LENGTH) ?? `${preview.platform}`,
    url: preview.canonicalUrl || preview.sourceUrl,
  };

  if (mainMedia?.previewUrl) {
    embed.image = {
      url: mainMedia.previewUrl,
    };
  }

  return embed;
};

const buildMediaEmbeds = (
  preview: MediaPreview,
  settings: GuildSettings
): APIEmbed[] => {
  if (preview.sensitive && !settings.autoPreview.nsfwMode) {
    return [];
  }

  if (settings.autoPreview.outputMode !== 'embed') {
    return [];
  }

  return preview.media.slice(1, 4).flatMap((item) => {
    if (!item.previewUrl) {
      return [];
    }

    return [
      {
        color: 0x1d9bf0,
        image: {
          url: item.previewUrl,
        },
        url: preview.canonicalUrl || preview.sourceUrl,
      } satisfies APIEmbed,
    ];
  });
};

export const buildPreviewMessagePayload = (
  preview: MediaPreview,
  settings: GuildSettings,
  options: {
    ownerUserId: string;
    sourceMessageId: string;
  }
) => {
  const actionRow = createActionRow(
    preview,
    settings,
    options.ownerUserId,
    options.sourceMessageId
  );

  return {
    components: actionRow ? [actionRow] : [],
    content: undefined,
    embeds: [
      buildPrimaryEmbed(preview, settings),
      ...buildMediaEmbeds(preview, settings),
    ],
  };
};
