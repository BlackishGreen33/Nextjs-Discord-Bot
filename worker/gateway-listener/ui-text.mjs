import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const uiCopy = require('../../src/common/utils/ui-copy.json');

const SUPPORTED_UI_LANGUAGES = ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'];
const DEFAULT_UI_LANGUAGE = 'zh-TW';

export const getUiLanguage = (value) => {
  if (!value) {
    return DEFAULT_UI_LANGUAGE;
  }

  if (SUPPORTED_UI_LANGUAGES.includes(value)) {
    return value;
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

export const getUiText = (value) => uiCopy[getUiLanguage(value)];

export const formatUiDateTime = (value, language) => {
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
