import type {
  APIActionRowComponent,
  APIButtonComponentWithCustomId,
  APIEmbed,
} from 'discord-api-types/v10';

import {
  isGifFeatureAvailable,
  isTranslateFeatureAvailable,
} from '@/common/configs/deployment';
import type { GuildSettings } from '@/common/stores';

import { buildPreviewActionCustomId, parseTwitterStatusId } from './media-link';
import type { MediaPreview } from './media-types';
import { getUiText } from './ui-text';

const ACTION_ROW_TYPE = 1;
const BUTTON_STYLE_SECONDARY = 2;
const BUTTON_TYPE = 2;
const MAX_DESCRIPTION_LENGTH = 1100;
const MAX_FIELD_VALUE_LENGTH = 1024;
const MAX_TITLE_LENGTH = 240;
const TWITTER_EMBED_COLOR = 0x0099ff;
const TWITTER_FOOTER_ICON_URL =
  'https://cdn.discordapp.com/emojis/1171098831023251477.webp?size=128&quality=lossless';
const ZERO_WIDTH_SPACE = '\u200B';

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

  return String(value);
};

const createActionRow = (
  preview: MediaPreview,
  settings: GuildSettings,
  ownerUserId: string,
  sourceMessageId: string
): APIActionRowComponent<APIButtonComponentWithCustomId> | null => {
  const components: APIButtonComponentWithCustomId[] = [];

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

  if (
    isTranslateFeatureAvailable() &&
    settings.autoPreview.features.translate &&
    trimText(preview.text, 200)
  ) {
    components.push({
      custom_id: buildPreviewActionCustomId(
        'translate',
        ownerUserId,
        sourceMessageId
      ),
      disabled: Boolean(preview.translatedText),
      emoji: { name: '🌐' },
      style: BUTTON_STYLE_SECONDARY,
      type: BUTTON_TYPE,
    });
  }

  if (
    isGifFeatureAvailable() &&
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

  if (preview.sensitive && !settings.autoPreview.nsfwMode) {
    const prefix = text.preview.sensitiveHidden;

    if (!baseText) {
      return prefix;
    }

    return `${prefix}\n\n${baseText}`;
  }

  return baseText ?? null;
};

const buildAuthorLabel = (preview: MediaPreview) =>
  preview.authorName || preview.authorHandle
    ? `${preview.authorName ?? ''} ${preview.authorHandle ? `(${preview.authorHandle})` : ''}`.trim()
    : null;

const buildAuthorUrl = (preview: MediaPreview) => {
  if (preview.platform !== 'Twitter') {
    return preview.canonicalUrl || preview.sourceUrl;
  }

  const handle = preview.authorHandle?.replace(/^@/, '').trim();

  return handle
    ? `https://twitter.com/${handle}`
    : preview.canonicalUrl || preview.sourceUrl;
};

const buildAuthorAvatarUrl = (preview: MediaPreview) => {
  if (!preview.authorAvatarUrl) {
    return undefined;
  }

  if (preview.platform !== 'Twitter') {
    return preview.authorAvatarUrl;
  }

  return preview.authorAvatarUrl.replace(
    /_(?:normal|mini|bigger|400x400|200x200)(\.[A-Za-z0-9]+)(?=([?#]|$))/,
    '_normal$1'
  );
};

const buildPostUrl = (preview: MediaPreview) => {
  if (preview.platform !== 'Twitter') {
    return preview.canonicalUrl || preview.sourceUrl;
  }

  const handle = preview.authorHandle?.replace(/^@/, '').trim();
  const statusId =
    parseTwitterStatusId(preview.canonicalUrl ?? '') ??
    parseTwitterStatusId(preview.sourceUrl);

  return handle && statusId
    ? `https://twitter.com/${handle}/status/${statusId}`
    : preview.canonicalUrl || preview.sourceUrl;
};

const buildTimestamp = (value: string | null | undefined) => {
  if (!value) {
    return undefined;
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return undefined;
  }

  return new Date(timestamp).toISOString();
};

const buildFields = (
  preview: MediaPreview,
  settings: GuildSettings
): NonNullable<APIEmbed['fields']> | undefined => {
  const text = getUiText(settings.autoPreview.translationTarget);
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
  const fields =
    settings.autoPreview.outputMode === 'embed' &&
    metrics.some((field) => field.value !== '-')
      ? [...metrics]
      : [];
  const translatedText = trimText(
    preview.translatedText,
    MAX_FIELD_VALUE_LENGTH
  );

  if (translatedText) {
    fields.push({
      inline: false,
      name: ZERO_WIDTH_SPACE,
      value: translatedText,
    });
  }

  return fields.length > 0 ? fields : undefined;
};

const buildPrimaryEmbed = (
  preview: MediaPreview,
  settings: GuildSettings
): APIEmbed => {
  const text = getUiText(settings.autoPreview.translationTarget);
  const authorLabel = buildAuthorLabel(preview) ?? text.common.unknownAuthor;
  const postUrl = buildPostUrl(preview);
  const mainMedia =
    preview.sensitive && !settings.autoPreview.nsfwMode
      ? null
      : (preview.media[0] ?? null);
  const embed: APIEmbed = {
    author: {
      icon_url: buildAuthorAvatarUrl(preview),
      name: preview.platform,
      url: buildAuthorUrl(preview),
    },
    color: preview.platform === 'Twitter' ? TWITTER_EMBED_COLOR : 0x1d9bf0,
    description: buildDescription(preview, settings) ?? undefined,
    fields: buildFields(preview, settings),
    footer: {
      icon_url:
        preview.platform === 'Twitter' ? TWITTER_FOOTER_ICON_URL : undefined,
      text: preview.publishedAt
        ? text.preview.footer.publishedAt
        : `${text.preview.footer.source}：${preview.platform}`,
    },
    timestamp: buildTimestamp(preview.publishedAt),
    title: trimText(authorLabel, MAX_TITLE_LENGTH) ?? `${preview.platform}`,
    url: postUrl,
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
        color: preview.platform === 'Twitter' ? TWITTER_EMBED_COLOR : 0x1d9bf0,
        image: {
          url: item.previewUrl,
        },
        url: buildPostUrl(preview),
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
