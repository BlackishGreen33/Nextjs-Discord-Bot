import { SlashCommandBuilder } from '@discordjs/builders';

import { executeCommand } from '@/common/types';

export const register = new SlashCommandBuilder()
  .setName('ping')
  .setDescription("pong's you back! (bot check)");

export const execute: executeCommand = async (interaction) => {
  const DISCORD_EPOCH = BigInt('1420070400000');
  const interactionId = BigInt(interaction.id);
  const interactionTimestamp = Number(
    (interactionId >> BigInt(22)) + DISCORD_EPOCH
  );
  const latency = Math.max(0, Date.now() - interactionTimestamp);

  return {
    type: 4,
    data: {
      content: `pong! delay: ${latency}ms`,
    },
  };
};
