import uiCopy from './ui-copy.json';

export const SUPPORTED_UI_LANGUAGES = [
  'zh-TW',
  'zh-CN',
  'en',
  'ja',
  'ko',
] as const;

export type UiLanguage = (typeof SUPPORTED_UI_LANGUAGES)[number];

type UiCopy = (typeof uiCopy)[UiLanguage];

const DEFAULT_UI_LANGUAGE: UiLanguage = 'zh-TW';

export const getUiLanguage = (value?: string | null): UiLanguage => {
  if (!value) {
    return DEFAULT_UI_LANGUAGE;
  }

  if ((SUPPORTED_UI_LANGUAGES as readonly string[]).includes(value)) {
    return value as UiLanguage;
  }

  if (value.startsWith('zh-TW') || value.startsWith('zh-Hant')) {
    return 'zh-TW';
  }

  if (value.startsWith('zh')) {
    return 'zh-CN';
  }

  if (value.startsWith('ja')) {
    return 'ja';
  }

  if (value.startsWith('ko')) {
    return 'ko';
  }

  if (value.startsWith('en')) {
    return 'en';
  }

  return DEFAULT_UI_LANGUAGE;
};

export const getUiText = (value?: string | null): UiCopy =>
  uiCopy[getUiLanguage(value)];

export const formatUiDateTime = (
  value: string | null | undefined,
  language?: string | null
) => {
  const uiLanguage = getUiLanguage(language);

  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return new Date(timestamp).toLocaleString(uiLanguage, {
    hour12: false,
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};
