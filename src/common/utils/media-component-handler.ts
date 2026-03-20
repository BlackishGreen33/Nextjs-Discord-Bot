import { APIInteractionResponse } from 'discord-api-types/v10';

import { DEFAULT_GUILD_SETTINGS, getGuildSettingsStore } from '@/common/stores';

import { discord_api } from './discord-api';
import {
  extractFirstSupportedMediaUrl,
  parsePreviewActionCustomId,
} from './media-link';
import {
  createMediaGif,
  getMediaPreview,
  type MediaGifResult,
  translateMediaText,
} from './media-worker';
import { buildPreviewMessagePayload } from './preview-card';
import { getRequesterLabel, hydrateSettingsUpdatedBy } from './settings-actor';
import {
  buildSettingsPanel,
  parseSettingsAction,
  SETTINGS_LANGUAGE_SELECT_CUSTOM_ID,
  SETTINGS_NAVIGATE_SELECT_ID,
} from './settings-panel';
import { getUiText } from './ui-text';

const EPHEMERAL_FLAG = 64;
const MESSAGE_WITH_SOURCE = 4;
const DEFERRED_UPDATE_MESSAGE = 6;
const UPDATE_MESSAGE = 7;
const MANAGE_GUILD_PERMISSION = BigInt(1) << BigInt(5);
const ADMINISTRATOR_PERMISSION = BigInt(1) << BigInt(3);
const GIF_INTERACTION_TIMEOUT_MS = 2800;

const toEphemeralMessage = (content: string): APIInteractionResponse => ({
  data: {
    content,
    flags: EPHEMERAL_FLAG,
  },
  type: MESSAGE_WITH_SOURCE,
});

const getTextForLanguage = (language?: string | null) =>
  getUiText(language ?? 'zh-TW');

type MessageComponentInteraction = {
  channel_id?: string;
  data: {
    component_type?: number;
    custom_id?: string;
    values?: string[];
  };
  guild_id?: string;
  member?: {
    nick?: string | null;
    permissions?: string;
    user?: {
      global_name?: string | null;
      id?: string;
      username?: string;
    };
  };
  message?: {
    content?: string;
    embeds?: Array<{
      description?: string;
      url?: string;
    }>;
    id?: string;
  };
  user?: {
    global_name?: string | null;
    id?: string;
    username?: string;
  };
};

type HandleMediaComponentInteractionOptions = {
  scheduleBackgroundTask?: (task: Promise<void>) => void;
};

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

const hasManagePermission = (interaction: MessageComponentInteraction) => {
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

const getGuildSettings = async (guildId: string | undefined) => {
  if (!guildId) {
    return DEFAULT_GUILD_SETTINGS;
  }

  const store = getGuildSettingsStore();

  if (!store.isAvailable()) {
    return DEFAULT_GUILD_SETTINGS;
  }

  return store.get(guildId);
};

const createQueuedGifResult = (): MediaGifResult => ({
  expiresAt: null,
  gifUrl: null,
  message: getTextForLanguage('zh-TW').preview.errors.gifQueued,
  provider: null,
  status: 'queued',
});

const withInteractionTimeout = async (
  promise: Promise<MediaGifResult>
): Promise<{ result: MediaGifResult; timedOut: boolean }> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<{
    result: MediaGifResult;
    timedOut: boolean;
  }>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({
        result: createQueuedGifResult(),
        timedOut: true,
      });
    }, GIF_INTERACTION_TIMEOUT_MS);
  });

  try {
    return await Promise.race([
      promise.then((result) => ({
        result,
        timedOut: false,
      })),
      timeoutPromise,
    ]);
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
};

const queueGifFollowUp = (
  promise: Promise<MediaGifResult>,
  params: {
    channelId: string;
    language: string;
    requesterId: string;
    sourceUrl: string;
  }
) =>
  promise
    .then(async (result) => {
      const text = getTextForLanguage(params.language);
      if (result.status === 'ready' && result.gifUrl) {
        await discord_api.post(`/channels/${params.channelId}/messages`, {
          content: `<@${params.requesterId}> ${text.preview.followUp.gifReady}\n${params.sourceUrl}`,
          embeds: [
            {
              color: 0x1d9bf0,
              image: {
                url: result.gifUrl,
              },
              title: text.preview.gifPreviewTitle,
              url: result.gifUrl,
            },
          ],
        });
        return;
      }

      await discord_api.post(`/channels/${params.channelId}/messages`, {
        content: `<@${params.requesterId}> ${text.preview.followUp.gifFailed}\n${params.sourceUrl}\n${result.message ?? text.preview.errors.gifFailed}`,
      });
    })
    .catch(() => {
      // Best effort follow-up only.
    });

const applySettingsToggle = (
  settings: typeof DEFAULT_GUILD_SETTINGS.autoPreview,
  action: ReturnType<typeof parseSettingsAction>,
  selectedValue: string | null
) => {
  if (!action) {
    return settings;
  }

  switch (action.action) {
    case 'toggle-enabled':
      return { ...settings, enabled: !settings.enabled };
    case 'toggle-feature-gif':
      return {
        ...settings,
        features: {
          ...settings.features,
          gif: !settings.features.gif,
        },
      };
    case 'toggle-feature-translate':
      return {
        ...settings,
        features: {
          ...settings.features,
          translate: !settings.features.translate,
        },
      };
    case 'toggle-nsfw':
      return { ...settings, nsfwMode: !settings.nsfwMode };
    case 'toggle-output-mode':
      return {
        ...settings,
        outputMode:
          settings.outputMode === 'embed'
            ? ('image' as const)
            : ('embed' as const),
      };
    case 'toggle-platform-bluesky':
      return {
        ...settings,
        platforms: {
          ...settings.platforms,
          bluesky: !settings.platforms.bluesky,
        },
      };
    case 'toggle-platform-pixiv':
      return {
        ...settings,
        platforms: {
          ...settings.platforms,
          pixiv: !settings.platforms.pixiv,
        },
      };
    case 'toggle-platform-twitter':
      return {
        ...settings,
        platforms: {
          ...settings.platforms,
          twitter: !settings.platforms.twitter,
        },
      };
    case 'language':
      return selectedValue
        ? {
            ...settings,
            translationTarget: selectedValue,
          }
        : settings;
    case 'view-only':
    default:
      return settings;
  }
};

const handleSettingsInteraction = async (
  interaction: MessageComponentInteraction
): Promise<APIInteractionResponse> => {
  const defaultText = getTextForLanguage('zh-TW');
  if (!interaction.guild_id) {
    return toEphemeralMessage(defaultText.settings.errors.guildOnly);
  }

  const store = getGuildSettingsStore();

  if (!store.isAvailable()) {
    return toEphemeralMessage(defaultText.settings.errors.storageUnavailable);
  }

  const customId = interaction.data.custom_id ?? '';
  const parsedAction =
    customId === SETTINGS_LANGUAGE_SELECT_CUSTOM_ID
      ? { action: 'language' as const, section: 'language' as const }
      : customId === SETTINGS_NAVIGATE_SELECT_ID
        ? {
            action: 'navigate' as const,
            section:
              (interaction.data.values?.[0] as
                | 'overview'
                | 'service'
                | 'platforms'
                | 'features'
                | 'language'
                | undefined) ?? 'overview',
          }
        : parseSettingsAction(customId);

  const current = await hydrateSettingsUpdatedBy(
    interaction.guild_id,
    await store.get(interaction.guild_id)
  );
  const currentText = getTextForLanguage(current.autoPreview.translationTarget);

  if (!parsedAction || parsedAction.action === 'view-only') {
    return toEphemeralMessage(currentText.settings.errors.unsupportedAction);
  }

  if (parsedAction.action === 'navigate') {
    const panel = buildSettingsPanel(current, {
      canManage: hasManagePermission(interaction),
      guildName: null,
      section: parsedAction.section,
    });

    return {
      data: {
        components: panel.components,
        embeds: panel.embeds,
      },
      type: UPDATE_MESSAGE,
    };
  }

  if (!hasManagePermission(interaction)) {
    return toEphemeralMessage(currentText.settings.errors.viewOnly);
  }

  const nextAutoPreview = applySettingsToggle(
    current.autoPreview,
    parsedAction,
    interaction.data.values?.[0] ?? null
  );
  const updated = await store.set(
    interaction.guild_id,
    nextAutoPreview,
    getRequesterLabel(interaction)
  );
  const panel = buildSettingsPanel(updated, {
    canManage: true,
    guildName: null,
    section: parsedAction.section,
  });

  return {
    data: {
      components: panel.components,
      embeds: panel.embeds,
    },
    type: UPDATE_MESSAGE,
  };
};

export const handleMediaComponentInteraction = async (
  interaction: MessageComponentInteraction,
  options?: HandleMediaComponentInteractionOptions
): Promise<APIInteractionResponse> => {
  const defaultText = getTextForLanguage('zh-TW');
  const customId = interaction.data.custom_id;

  if (!customId) {
    return toEphemeralMessage(defaultText.preview.errors.unsupportedAction);
  }

  if (customId.startsWith('st:v2:')) {
    return handleSettingsInteraction(interaction);
  }

  const parsed = parsePreviewActionCustomId(customId);

  if (!parsed) {
    return toEphemeralMessage(defaultText.preview.errors.unsupportedAction);
  }

  const requesterId = getRequesterId(interaction);
  const sourceUrl = extractSourceUrlFromMessage(interaction);

  if (!sourceUrl) {
    return toEphemeralMessage(defaultText.preview.errors.previewSourceMissing);
  }

  if (parsed.action === 'retract') {
    const settings = await getGuildSettings(interaction.guild_id);
    const text = getTextForLanguage(settings.autoPreview.translationTarget);
    const allowed =
      requesterId === parsed.ownerUserId || hasManagePermission(interaction);

    if (!allowed) {
      return toEphemeralMessage(text.preview.errors.onlyOwnerCanRetract);
    }

    if (!interaction.channel_id || !interaction.message?.id) {
      return toEphemeralMessage(text.preview.errors.retractNotFound);
    }

    try {
      await discord_api.delete(
        `/channels/${interaction.channel_id}/messages/${interaction.message.id}`
      );
      return {
        type: DEFERRED_UPDATE_MESSAGE,
      };
    } catch {
      return toEphemeralMessage(text.preview.errors.retractFailed);
    }
  }

  const settings = await getGuildSettings(interaction.guild_id);
  const text = getTextForLanguage(settings.autoPreview.translationTarget);
  const preview = await getMediaPreview(sourceUrl);

  if (parsed.action === 'translate') {
    if (!settings.autoPreview.features.translate) {
      return toEphemeralMessage(text.preview.errors.translateDisabled);
    }

    if (!preview.text) {
      return toEphemeralMessage(text.preview.errors.translateNoText);
    }

    try {
      const translation = await translateMediaText({
        sourceUrl,
        targetLanguage: settings.autoPreview.translationTarget,
        text: preview.text,
      });
      const panel = buildPreviewMessagePayload(
        {
          ...preview,
          translatedText: translation.translatedText,
        },
        settings,
        {
          ownerUserId: parsed.ownerUserId,
          sourceMessageId: parsed.sourceMessageId,
        }
      );

      return {
        data: panel,
        type: UPDATE_MESSAGE,
      };
    } catch (error) {
      const maybeError = error as { message?: string };
      return toEphemeralMessage(
        maybeError.message ?? text.preview.errors.translateFailed
      );
    }
  }

  if (!settings.autoPreview.features.gif) {
    return toEphemeralMessage(text.preview.errors.gifDisabled);
  }

  const gifCandidate = preview.media.find(
    (item) => item.gifConvertible && item.sourceUrl
  );

  if (!gifCandidate?.sourceUrl) {
    return toEphemeralMessage(text.preview.errors.gifNoCandidate);
  }

  const gifPromise = createMediaGif({
    channelId: interaction.channel_id ?? null,
    guildId: interaction.guild_id ?? null,
    mediaUrl: gifCandidate.sourceUrl,
    requesterId,
    sourceUrl,
  });
  const { result, timedOut } = await withInteractionTimeout(gifPromise);

  if (timedOut && interaction.channel_id) {
    const backgroundTask = queueGifFollowUp(gifPromise, {
      channelId: interaction.channel_id,
      language: settings.autoPreview.translationTarget,
      requesterId,
      sourceUrl,
    });

    if (options?.scheduleBackgroundTask) {
      options.scheduleBackgroundTask(backgroundTask);
    } else {
      void backgroundTask;
    }
  }

  if (result.status === 'queued') {
    return toEphemeralMessage(result.message ?? text.preview.errors.gifQueued);
  }

  if (result.status === 'ready' && result.gifUrl) {
    return {
      data: {
        embeds: [
          {
            color: 0x1d9bf0,
            image: {
              url: result.gifUrl,
            },
            title: text.preview.gifPreviewTitle,
            url: result.gifUrl,
          },
        ],
      },
      type: MESSAGE_WITH_SOURCE,
    };
  }

  return toEphemeralMessage(result.message ?? text.preview.errors.gifFailed);
};
