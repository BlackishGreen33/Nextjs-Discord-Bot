import { SlashCommandBuilder } from '@discordjs/builders';

import commandRegistry from '@/commands';
import { executeCommand } from '@/common/types';

type commandModule = {
  execute: executeCommand;
  register: SlashCommandBuilder;
};

let seenCommands: {
  [key: string]: commandModule;
} | null = null;

const getCommands = async () => {
  if (seenCommands) return seenCommands;
  seenCommands = commandRegistry as { [key: string]: commandModule };
  return seenCommands;
};

export default getCommands;
