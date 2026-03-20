import { SlashCommandBuilder } from '@discordjs/builders';

import { getGuildSettingsStore } from '@/common/stores';
import type { executeCommand } from '@/common/types';
import { hydrateSettingsUpdatedBy } from '@/common/utils/settings-actor';
import { buildSettingsPanel } from '@/common/utils/settings-panel';
import { getUiText } from '@/common/utils/ui-text';

const MESSAGE_WITH_SOURCE = 4;
const EPHEMERAL_FLAG = 64;
const ADMINISTRATOR_PERMISSION = BigInt(1) << BigInt(3);
const MANAGE_GUILD_PERMISSION = BigInt(1) << BigInt(5);

const toEphemeralMessage = (content: string) => ({
  data: {
    content,
    flags: EPHEMERAL_FLAG,
  },
  type: MESSAGE_WITH_SOURCE,
});

const getPermissionBits = (interaction: Parameters<executeCommand>[0]) => {
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

const hasManagePermission = (interaction: Parameters<executeCommand>[0]) => {
  const bits = getPermissionBits(interaction);

  if (bits === null) {
    return false;
  }

  return (
    (bits & (MANAGE_GUILD_PERMISSION | ADMINISTRATOR_PERMISSION)) !== BigInt(0)
  );
};

export const register = new SlashCommandBuilder()
  .setName('settings')
  .setDescription('開啟伺服器預覽設定面板')
  .setDescriptionLocalizations({
    'en-GB': 'Open the server auto preview settings panel',
    'en-US': 'Open the server auto preview settings panel',
    ja: 'サーバーのプレビュー設定パネルを開く',
    ko: '서버 미리보기 설정 패널 열기',
    'zh-CN': '打开服务器预览设置面板',
    'zh-TW': '開啟伺服器預覽設定面板',
  });

export const execute: executeCommand = async (interaction) => {
  const defaultText = getUiText('zh-TW');

  if (!interaction.guild_id) {
    return toEphemeralMessage(defaultText.settings.errors.guildOnly);
  }

  const guildSettingsStore = getGuildSettingsStore();

  if (!guildSettingsStore.isAvailable()) {
    return toEphemeralMessage(defaultText.settings.errors.storageUnavailable);
  }

  const storedSettings = await guildSettingsStore.get(interaction.guild_id);
  const settings = await hydrateSettingsUpdatedBy(
    interaction.guild_id,
    storedSettings
  );
  const canManage = hasManagePermission(interaction);
  const panel = buildSettingsPanel(settings, {
    canManage,
    guildName: null,
  });

  return {
    data: {
      components: panel.components,
      embeds: panel.embeds,
      flags: canManage ? undefined : EPHEMERAL_FLAG,
    },
    type: MESSAGE_WITH_SOURCE,
  };
};
