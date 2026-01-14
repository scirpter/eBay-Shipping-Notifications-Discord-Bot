import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';

import type { Command } from './types.js';

import { command as ebay } from '../commands/ebay.js';

export const commands: Command[] = [ebay];

export const commandMap = new Map<string, Command>(commands.map((cmd) => [cmd.data.name, cmd]));

export function getCommandsJson(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  return commands.map((cmd) => cmd.data.toJSON());
}

