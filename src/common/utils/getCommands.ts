import { SlashCommandBuilder } from '@discordjs/builders';
import { resolve } from 'path';

import { executeCommand } from '../types';
import getTsFiles from './getTsFiles';

type commandModule = {
  execute: executeCommand;
  register: SlashCommandBuilder;
};

let seenCommands: {
  [key: string]: commandModule;
} | null = null;

const getCommands = async () => {
  if (seenCommands) return seenCommands;
  const commandDir = resolve(`${process.cwd()}/src`, 'commands');
  const commandFiles = getTsFiles(commandDir);
  const commands: { [key: string]: commandModule } = {};
  for (const file of commandFiles) {
    try {
      const fileContents = (await import(
        '@/commands/' + file
      )) as commandModule;
      if (fileContents) commands[file] = fileContents;
    } catch {
      continue;
    }
  }
  seenCommands = commands;
  return commands;
};

export default getCommands;
