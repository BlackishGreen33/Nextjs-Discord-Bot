import type {
  APIActionRowComponent,
  APIButtonComponentWithCustomId,
  APIEmbed,
  APIStringSelectComponent,
} from 'discord-api-types/v10';

import type { GuildSettings } from '@/common/stores';

import {
  formatUiDateTime,
  getUiLanguage,
  getUiText,
  SUPPORTED_UI_LANGUAGES,
} from './ui-text';

const ACTION_ROW_TYPE = 1;
const BUTTON_STYLE_DANGER = 4;
const BUTTON_STYLE_PRIMARY = 1;
const BUTTON_STYLE_SECONDARY = 2;
const BUTTON_STYLE_SUCCESS = 3;
const BUTTON_TYPE = 2;
const STRING_SELECT_TYPE = 3;
const SETTINGS_PREFIX = 'st:v2';
const SETTINGS_NAVIGATE_SELECT_CUSTOM_ID_INTERNAL = `${SETTINGS_PREFIX}:navigate`;
const SETTINGS_LANGUAGE_SELECT_CUSTOM_ID_INTERNAL = `${SETTINGS_PREFIX}:language`;

export type SettingsSection =
  | 'overview'
  | 'service'
  | 'platforms'
  | 'features'
  | 'language';

export type SettingsButtonAction =
  | 'toggle-enabled'
  | 'toggle-feature-gif'
  | 'toggle-feature-translate'
  | 'toggle-nsfw'
  | 'toggle-output-mode'
  | 'toggle-platform-bluesky'
  | 'toggle-platform-pixiv'
  | 'toggle-platform-twitter';

type ParsedSettingsAction =
  | { action: 'language'; section: 'language' }
  | { action: 'navigate'; section: SettingsSection }
  | { action: 'view-only'; section: SettingsSection }
  | { action: SettingsButtonAction; section: SettingsSection };

type SettingsPanelOptions = {
  canManage: boolean;
  guildName?: string | null;
  section?: SettingsSection;
};

const toCustomId = (action: SettingsButtonAction, section: SettingsSection) =>
  `${SETTINGS_PREFIX}:${action}:${section}`;

const toCodeBlock = (lines: string[]) => ['```md', ...lines, '```'].join('\n');

const getStatusText = (value: boolean, language: string) => {
  const text = getUiText(language);
  return value ? text.common.enabled : text.common.disabled;
};

const getStatusBadge = (value: boolean, language: string) =>
  `${value ? '🟢' : '🔴'} ${getStatusText(value, language)}`;

const getOutputModeText = (
  outputMode: GuildSettings['autoPreview']['outputMode'],
  language: string
) => {
  const text = getUiText(language);
  return text.settings.modes[outputMode];
};

const getOutputModeBadge = (
  outputMode: GuildSettings['autoPreview']['outputMode'],
  language: string
) =>
  `${outputMode === 'embed' ? '🔵' : '🟣'} ${getOutputModeText(outputMode, language)}`;

const getLanguageName = (value: string, language: string) => {
  const text = getUiText(language);
  const locale = getUiLanguage(value);
  return text.settings.languageNames[locale];
};

const buildValueBlock = (value: string) => toCodeBlock([value]);

const buildSummaryEntries = (
  entries: Array<{ emoji: string; label: string; value: string }>
) =>
  entries
    .map(
      (entry) =>
        `${entry.emoji} ${entry.label}\n${buildValueBlock(entry.value)}`
    )
    .join('\n');

const createToggleButton = (
  label: string,
  enabled: boolean,
  language: string,
  customId: string,
  disabled = false
): APIButtonComponentWithCustomId => ({
  custom_id: customId,
  disabled,
  label: `${label}：${getStatusText(enabled, language)}`,
  style: enabled ? BUTTON_STYLE_SUCCESS : BUTTON_STYLE_DANGER,
  type: BUTTON_TYPE,
});

const createOutputModeButton = (
  outputMode: GuildSettings['autoPreview']['outputMode'],
  section: SettingsSection,
  language: string,
  disabled = false
): APIButtonComponentWithCustomId => {
  const text = getUiText(language);

  return {
    custom_id: toCustomId('toggle-output-mode', section),
    disabled,
    label: `${text.settings.labels.outputMode}：${getOutputModeText(outputMode, language)}`,
    style: BUTTON_STYLE_PRIMARY,
    type: BUTTON_TYPE,
  };
};

const createBackButton = (
  language: string,
  disabled = false
): APIButtonComponentWithCustomId => ({
  custom_id: `${SETTINGS_PREFIX}:navigate:overview`,
  disabled,
  label: getUiText(language).common.back,
  style: BUTTON_STYLE_SECONDARY,
  type: BUTTON_TYPE,
});

const createInfoButton = (
  label: string,
  disabled = true
): APIButtonComponentWithCustomId => ({
  custom_id: `${SETTINGS_PREFIX}:view-only:overview`,
  disabled,
  label,
  style: BUTTON_STYLE_SECONDARY,
  type: BUTTON_TYPE,
});

const createSectionSelect = (
  currentSection: SettingsSection,
  language: string,
  disabled = false
): APIActionRowComponent<APIStringSelectComponent> => {
  const text = getUiText(language);

  return {
    components: [
      {
        custom_id: SETTINGS_NAVIGATE_SELECT_CUSTOM_ID_INTERNAL,
        disabled,
        options: (
          [
            'overview',
            'service',
            'platforms',
            'features',
            'language',
          ] satisfies SettingsSection[]
        ).map((section) => ({
          default: currentSection !== 'overview' && section === currentSection,
          label: text.settings.sections[section],
          value: section,
        })),
        placeholder: text.settings.actions.selectPlaceholder,
        type: STRING_SELECT_TYPE,
      },
    ],
    type: ACTION_ROW_TYPE,
  };
};

const createLanguageSelect = (
  target: string,
  language: string,
  disabled = false
): APIActionRowComponent<APIStringSelectComponent> => {
  const text = getUiText(language);

  return {
    components: [
      {
        custom_id: SETTINGS_LANGUAGE_SELECT_CUSTOM_ID_INTERNAL,
        disabled,
        options: SUPPORTED_UI_LANGUAGES.map((locale) => ({
          default: getUiLanguage(target) === locale,
          label: text.settings.languageNames[locale],
          value: locale,
        })),
        placeholder: text.settings.labels.language,
        type: STRING_SELECT_TYPE,
      },
    ],
    type: ACTION_ROW_TYPE,
  };
};

const buildServiceSummary = (settings: GuildSettings, language: string) =>
  buildSummaryEntries([
    {
      emoji: '🌐',
      label: getUiText(language).settings.labels.autoPreview,
      value: getStatusBadge(settings.autoPreview.enabled, language),
    },
    {
      emoji: '🧱',
      label: getUiText(language).settings.labels.outputMode,
      value: getOutputModeBadge(settings.autoPreview.outputMode, language),
    },
    {
      emoji: '🔞',
      label: getUiText(language).settings.labels.nsfwMode,
      value: getStatusBadge(settings.autoPreview.nsfwMode, language),
    },
  ]);

const buildFeaturesSummary = (settings: GuildSettings, language: string) =>
  buildSummaryEntries([
    {
      emoji: '✨',
      label: getUiText(language).settings.labels.translate,
      value: getStatusBadge(settings.autoPreview.features.translate, language),
    },
    {
      emoji: '🎞️',
      label: getUiText(language).settings.labels.gif,
      value: getStatusBadge(settings.autoPreview.features.gif, language),
    },
  ]);

const buildPlatformsSummary = (settings: GuildSettings, language: string) =>
  buildSummaryEntries([
    {
      emoji: '🐦',
      label: getUiText(language).settings.labels.twitter,
      value: getStatusBadge(settings.autoPreview.platforms.twitter, language),
    },
    {
      emoji: '🎨',
      label: getUiText(language).settings.labels.pixiv,
      value: getStatusBadge(settings.autoPreview.platforms.pixiv, language),
    },
    {
      emoji: '🦋',
      label: getUiText(language).settings.labels.bluesky,
      value: getStatusBadge(settings.autoPreview.platforms.bluesky, language),
    },
  ]);

const buildLanguageSummary = (settings: GuildSettings, language: string) =>
  buildSummaryEntries([
    {
      emoji: '🌏',
      label: getUiText(language).settings.labels.language,
      value: getLanguageName(settings.autoPreview.translationTarget, language),
    },
  ]);

const buildMetaSummary = (settings: GuildSettings, language: string) => {
  const text = getUiText(language);

  return buildSummaryEntries([
    {
      emoji: '👤',
      label: text.settings.fields.lastUpdatedBy,
      value: settings.updatedBy || text.common.none,
    },
    {
      emoji: '🕒',
      label: text.settings.fields.lastUpdatedAt,
      value: formatUiDateTime(settings.updatedAt, language) ?? text.common.none,
    },
  ]);
};

const getPanelTitle = (
  guildName: string | null | undefined,
  language: string
) => {
  const text = getUiText(language);
  const fallbackTitle = text.settings.title.replace(/[『』]/g, '').trim();

  return guildName?.trim() || fallbackTitle;
};

const buildSectionSummary = (
  settings: GuildSettings,
  section: SettingsSection,
  language: string
) => {
  switch (section) {
    case 'service':
      return buildServiceSummary(settings, language);
    case 'platforms':
      return buildPlatformsSummary(settings, language);
    case 'features':
      return buildFeaturesSummary(settings, language);
    case 'language':
      return buildLanguageSummary(settings, language);
    case 'overview':
    default:
      return buildServiceSummary(settings, language);
  }
};

const buildEmbed = (
  settings: GuildSettings,
  section: SettingsSection,
  guildName: string | null | undefined,
  language: string
): APIEmbed => {
  const text = getUiText(language);
  const title = getPanelTitle(guildName, language);

  if (section === 'overview') {
    return {
      color: 0x34d9d9,
      description: [
        text.settings.description[section],
        '',
        `${text.settings.fields.currentSettings}：`,
      ].join('\n'),
      fields: [
        {
          inline: true,
          name: `【${text.settings.sections.service}】`,
          value: buildServiceSummary(settings, language),
        },
        {
          inline: true,
          name: `【${text.settings.sections.features}】`,
          value: buildFeaturesSummary(settings, language),
        },
        {
          inline: true,
          name: `【${text.settings.sections.platforms}】`,
          value: buildPlatformsSummary(settings, language),
        },
        {
          inline: true,
          name: `【${text.settings.sections.language}】`,
          value: buildLanguageSummary(settings, language),
        },
        {
          inline: false,
          name: `【${text.settings.fields.lastUpdatedBy} / ${text.settings.fields.lastUpdatedAt}】`,
          value: buildMetaSummary(settings, language),
        },
      ],
      title: `⚙️ ${title}`,
    };
  }

  return {
    color: 0x34d9d9,
    description: `『${text.settings.sections[section]}』\n${text.settings.description[section]}`,
    fields: [
      {
        name: `【${text.settings.sections[section]}】`,
        value: buildSectionSummary(settings, section, language),
      },
      {
        name: `【${text.settings.fields.lastUpdatedBy} / ${text.settings.fields.lastUpdatedAt}】`,
        value: buildMetaSummary(settings, language),
      },
    ],
    title: `⚙️ ${title}`,
  };
};

const buildSectionControls = (
  settings: GuildSettings,
  section: SettingsSection,
  language: string,
  canManage: boolean
): Array<
  | APIActionRowComponent<APIButtonComponentWithCustomId>
  | APIActionRowComponent<APIStringSelectComponent>
> => {
  const text = getUiText(language);
  const disabled = !canManage;
  const controls: Array<
    | APIActionRowComponent<APIButtonComponentWithCustomId>
    | APIActionRowComponent<APIStringSelectComponent>
  > = [createSectionSelect(section, language)];

  if (section === 'overview') {
    return controls;
  }

  if (section === 'service') {
    controls.push({
      components: [
        createToggleButton(
          text.settings.labels.autoPreview,
          settings.autoPreview.enabled,
          language,
          toCustomId('toggle-enabled', section),
          disabled
        ),
        createOutputModeButton(
          settings.autoPreview.outputMode,
          section,
          language,
          disabled
        ),
        createToggleButton(
          text.settings.labels.nsfwMode,
          settings.autoPreview.nsfwMode,
          language,
          toCustomId('toggle-nsfw', section),
          disabled
        ),
      ],
      type: ACTION_ROW_TYPE,
    });
  }

  if (section === 'platforms') {
    controls.push({
      components: [
        createToggleButton(
          text.settings.labels.twitter,
          settings.autoPreview.platforms.twitter,
          language,
          toCustomId('toggle-platform-twitter', section),
          disabled
        ),
        createToggleButton(
          text.settings.labels.pixiv,
          settings.autoPreview.platforms.pixiv,
          language,
          toCustomId('toggle-platform-pixiv', section),
          disabled
        ),
        createToggleButton(
          text.settings.labels.bluesky,
          settings.autoPreview.platforms.bluesky,
          language,
          toCustomId('toggle-platform-bluesky', section),
          disabled
        ),
      ],
      type: ACTION_ROW_TYPE,
    });
  }

  if (section === 'features') {
    controls.push({
      components: [
        createToggleButton(
          text.settings.labels.translate,
          settings.autoPreview.features.translate,
          language,
          toCustomId('toggle-feature-translate', section),
          disabled
        ),
        createToggleButton(
          text.settings.labels.gif,
          settings.autoPreview.features.gif,
          language,
          toCustomId('toggle-feature-gif', section),
          disabled
        ),
      ],
      type: ACTION_ROW_TYPE,
    });
  }

  if (section === 'language') {
    controls.push(
      createLanguageSelect(
        settings.autoPreview.translationTarget,
        language,
        disabled
      )
    );
  }

  controls.push({
    components: [
      createBackButton(language),
      createInfoButton(
        canManage
          ? text.settings.description[section]
          : text.settings.actions.disabledHint
      ),
    ],
    type: ACTION_ROW_TYPE,
  });

  return controls;
};

export const buildSettingsPanel = (
  settings: GuildSettings,
  options: SettingsPanelOptions
): {
  components: Array<
    | APIActionRowComponent<APIButtonComponentWithCustomId>
    | APIActionRowComponent<APIStringSelectComponent>
  >;
  embeds: APIEmbed[];
} => {
  const language = settings.autoPreview.translationTarget;
  const section = options.section ?? 'overview';

  return {
    components: buildSectionControls(
      settings,
      section,
      language,
      options.canManage
    ),
    embeds: [buildEmbed(settings, section, options.guildName, language)],
  };
};

export const parseSettingsAction = (
  customId: string
): ParsedSettingsAction | null => {
  const parts = customId.split(':');

  if (parts.length < 3) {
    return null;
  }

  if (`${parts[0]}:${parts[1]}` !== SETTINGS_PREFIX) {
    return null;
  }

  const action = parts[2];

  if (action === 'navigate') {
    const section = (parts[3] ?? 'overview') as SettingsSection;
    if (
      !['overview', 'service', 'platforms', 'features', 'language'].includes(
        section
      )
    ) {
      return null;
    }

    return { action: 'navigate', section };
  }

  if (action === 'language') {
    return { action: 'language', section: 'language' };
  }

  if (action === 'view-only') {
    return { action: 'view-only', section: 'overview' };
  }

  const section = (parts[3] ?? 'overview') as SettingsSection;
  const allowedActions: SettingsButtonAction[] = [
    'toggle-enabled',
    'toggle-feature-gif',
    'toggle-feature-translate',
    'toggle-nsfw',
    'toggle-output-mode',
    'toggle-platform-bluesky',
    'toggle-platform-pixiv',
    'toggle-platform-twitter',
  ];

  if (
    !allowedActions.includes(action as SettingsButtonAction) ||
    !['overview', 'service', 'platforms', 'features', 'language'].includes(
      section
    )
  ) {
    return null;
  }

  return {
    action: action as SettingsButtonAction,
    section,
  };
};

export const SETTINGS_LANGUAGE_SELECT_CUSTOM_ID =
  SETTINGS_LANGUAGE_SELECT_CUSTOM_ID_INTERNAL;
export const SETTINGS_NAVIGATE_SELECT_ID =
  SETTINGS_NAVIGATE_SELECT_CUSTOM_ID_INTERNAL;
