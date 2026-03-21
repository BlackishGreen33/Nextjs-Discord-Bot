import { SlashCommandBuilder } from '@discordjs/builders';
import type { APIInteractionResponse } from 'discord-api-types/v10';

import { getFaqStore } from '@/common/stores';
import type { executeCommand } from '@/common/types';

const COMMAND_TYPE_CHANNEL_MESSAGE_WITH_SOURCE = 4;
const EPHEMERAL_FLAG = 64;
const MAX_FAQ_KEY_LENGTH = 64;
const MAX_FAQ_ANSWER_LENGTH = 1500;
const MAX_LIST_ITEMS = 25;
const SUBCOMMAND_OPTION_TYPE = 1;
const STRING_OPTION_TYPE = 3;
const ADMINISTRATOR_PERMISSION = BigInt(1) << BigInt(3);
const MANAGE_GUILD_PERMISSION = BigInt(1) << BigInt(5);

type RawOption = {
  name: string;
  options?: RawOption[];
  type: number;
  value?: unknown;
};

type ParsedFaqAction =
  | {
      subcommand: 'get';
      key: string;
    }
  | {
      subcommand: 'delete';
      key: string;
    }
  | {
      subcommand: 'list';
    }
  | {
      answer: string;
      key: string;
      subcommand: 'set';
    };

type CommandInteraction = Parameters<executeCommand>[0];

const createMessageResponse = (
  content: string,
  ephemeral = false
): APIInteractionResponse => {
  if (ephemeral) {
    return {
      data: {
        content,
        flags: EPHEMERAL_FLAG,
      },
      type: COMMAND_TYPE_CHANNEL_MESSAGE_WITH_SOURCE,
    };
  }

  return {
    data: {
      content,
    },
    type: COMMAND_TYPE_CHANNEL_MESSAGE_WITH_SOURCE,
  };
};

const getStringOption = (options: RawOption[], optionName: string) => {
  const option = options.find(
    (candidate) =>
      candidate.name === optionName && candidate.type === STRING_OPTION_TYPE
  );

  if (!option || typeof option.value !== 'string') {
    return null;
  }

  return option.value;
};

const parseFaqAction = (
  interaction: CommandInteraction
): ParsedFaqAction | null => {
  const options = (interaction.data as { options?: RawOption[] }).options;

  if (!Array.isArray(options)) {
    return null;
  }

  const subcommand = options.find(
    (option) => option.type === SUBCOMMAND_OPTION_TYPE
  );

  if (!subcommand || typeof subcommand.name !== 'string') {
    return null;
  }

  const nestedOptions = Array.isArray(subcommand.options)
    ? subcommand.options
    : [];

  if (subcommand.name === 'list') {
    return { subcommand: 'list' };
  }

  if (subcommand.name === 'get' || subcommand.name === 'delete') {
    const key = getStringOption(nestedOptions, 'key');
    if (!key) {
      return null;
    }

    return {
      key,
      subcommand: subcommand.name,
    };
  }

  if (subcommand.name === 'set') {
    const key = getStringOption(nestedOptions, 'key');
    const answer = getStringOption(nestedOptions, 'answer');

    if (!key || !answer) {
      return null;
    }

    return {
      answer,
      key,
      subcommand: 'set',
    };
  }

  return null;
};

const getMemberPermissionBits = (
  interaction: CommandInteraction
): bigint | null => {
  const permissions = (
    interaction.member as
      | {
          permissions?: string;
        }
      | undefined
  )?.permissions;

  if (!permissions) {
    return null;
  }

  try {
    return BigInt(permissions);
  } catch {
    return null;
  }
};

const hasFaqWritePermission = (interaction: CommandInteraction) => {
  const bits = getMemberPermissionBits(interaction);

  if (bits === null) {
    return false;
  }

  return (
    (bits & (ADMINISTRATOR_PERMISSION | MANAGE_GUILD_PERMISSION)) !== BigInt(0)
  );
};

const normalizeWhitespace = (value: string) =>
  value.trim().replace(/\s+/g, ' ');

export const normalizeFaqKey = (value: string) => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_FAQ_KEY_LENGTH);

  if (normalized.length === 0) {
    return null;
  }

  return normalized;
};

const formatFaqList = (keys: string[]) => {
  const items = keys.slice(0, MAX_LIST_ITEMS);
  const list = items.map((key, index) => `${index + 1}. \`${key}\``).join('\n');

  if (keys.length <= MAX_LIST_ITEMS) {
    return `FAQ keys (${keys.length})\n${list}`;
  }

  return `FAQ keys (${keys.length})\n${list}\nShowing first ${MAX_LIST_ITEMS} entries.`;
};

export const register = new SlashCommandBuilder()
  .setName('faq')
  .setDescription('Guild FAQ knowledge base')
  .addSubcommand((subcommand) =>
    subcommand
      .setName('get')
      .setDescription('Get an FAQ answer by key')
      .addStringOption((option) =>
        option
          .setName('key')
          .setDescription('FAQ key, e.g. welcome-rules')
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('set')
      .setDescription('Create or update an FAQ entry (admin only)')
      .addStringOption((option) =>
        option
          .setName('key')
          .setDescription('FAQ key, e.g. welcome-rules')
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName('answer')
          .setDescription('FAQ answer text')
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('delete')
      .setDescription('Delete an FAQ entry (admin only)')
      .addStringOption((option) =>
        option
          .setName('key')
          .setDescription('FAQ key to delete')
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand.setName('list').setDescription('List FAQ keys in this server')
  );

export const execute: executeCommand = async (interaction) => {
  const guildId = interaction.guild_id;

  if (!guildId) {
    return createMessageResponse(
      'FAQ command is only available inside a Discord server.',
      true
    );
  }

  const parsedAction = parseFaqAction(interaction);

  if (!parsedAction) {
    return createMessageResponse('Invalid FAQ command input.', true);
  }

  const faqStore = getFaqStore();

  if (!faqStore.isAvailable()) {
    return createMessageResponse(
      'FAQ storage is not configured. Set DATABASE_URL or the Redis storage env variables.',
      true
    );
  }

  try {
    if (parsedAction.subcommand === 'list') {
      const keys = await faqStore.listKeys(guildId);

      if (keys.length === 0) {
        return createMessageResponse(
          'No FAQ entries yet. Use `/faq set <key> <answer>` to add one.'
        );
      }

      return createMessageResponse(formatFaqList(keys));
    }

    const normalizedKey = normalizeFaqKey(parsedAction.key);

    if (!normalizedKey) {
      return createMessageResponse(
        'FAQ key is invalid. Use letters, numbers, spaces, `_`, or `-`.',
        true
      );
    }

    if (parsedAction.subcommand === 'get') {
      const entry = await faqStore.get(guildId, normalizedKey);

      if (!entry) {
        return createMessageResponse(
          `No FAQ entry found for \`${normalizedKey}\`.`
        );
      }

      return createMessageResponse(`**${normalizedKey}**\n${entry.answer}`);
    }

    if (!hasFaqWritePermission(interaction)) {
      return createMessageResponse(
        'Only server admins can create or delete FAQ entries.',
        true
      );
    }

    if (parsedAction.subcommand === 'delete') {
      const deleted = await faqStore.delete(guildId, normalizedKey);

      if (!deleted) {
        return createMessageResponse(
          `No FAQ entry found for \`${normalizedKey}\`.`,
          true
        );
      }

      return createMessageResponse(
        `Deleted FAQ entry \`${normalizedKey}\`.`,
        true
      );
    }

    const normalizedAnswer = normalizeWhitespace(parsedAction.answer);

    if (normalizedAnswer.length === 0) {
      return createMessageResponse('FAQ answer cannot be empty.', true);
    }

    if (normalizedAnswer.length > MAX_FAQ_ANSWER_LENGTH) {
      return createMessageResponse(
        `FAQ answer is too long. Max length is ${MAX_FAQ_ANSWER_LENGTH} characters.`,
        true
      );
    }

    const updatedBy =
      interaction.user?.id ?? interaction.member?.user?.id ?? 'unknown';

    await faqStore.set(guildId, normalizedKey, normalizedAnswer, updatedBy);

    return createMessageResponse(`Saved FAQ entry \`${normalizedKey}\`.`, true);
  } catch {
    return createMessageResponse(
      'FAQ command failed due to storage error. Please try again later.',
      true
    );
  }
};
