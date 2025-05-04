import { SlashCommandBuilder } from '@discordjs/builders';

import { executeCommand } from '@/common/types';

export const register = new SlashCommandBuilder()
  .setName('ping')
  .setDescription("pong's you back! (bot check)");

export const execute: executeCommand = async (interaction) => {
  const msgCreatedTimestamp = new Date(
    interaction.message?.timestamp ?? Date.now()
  ).getTime();
  const latency = msgCreatedTimestamp ? Date.now() - msgCreatedTimestamp : 0;

  return {
    type: 4,
    data: {
      content: `pong! delay: ${latency}ms`,
    },
  };
};
