import type { executeCommand } from '@/common/types';

import * as faq from './faq';
import * as help from './help';
import * as ping from './ping';
import * as tutorialhere from './tutorialhere';

type CommandModule = {
  execute: executeCommand;
  register: {
    name: string;
    toJSON: () => unknown;
  };
};

const commands: Record<string, CommandModule> = {
  [faq.register.name]: faq as CommandModule,
  [help.register.name]: help as CommandModule,
  [ping.register.name]: ping as CommandModule,
  [tutorialhere.register.name]: tutorialhere as CommandModule,
};

export default commands;
