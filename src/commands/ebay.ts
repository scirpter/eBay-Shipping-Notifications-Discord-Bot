import { SlashCommandBuilder } from 'discord.js';

import type { Command } from '../bot/types.js';

import { executeConnect, registerConnect } from './ebay/connect.js';
import { executeConfig, registerConfig } from './ebay/config.js';
import { executeDisconnect, registerDisconnect } from './ebay/disconnect.js';
import { executeStatus, registerStatus } from './ebay/status.js';
import { executeUnlink, registerUnlink } from './ebay/unlink.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('ebay')
    .setDescription('eBay order shipping notifications')
    .addSubcommand((sub) => registerConnect(sub))
    .addSubcommand((sub) => registerDisconnect(sub))
    .addSubcommand((sub) => registerUnlink(sub))
    .addSubcommand((sub) => registerConfig(sub))
    .addSubcommand((sub) => registerStatus(sub)),

  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    switch (sub) {
      case 'connect':
        return executeConnect(interaction, ctx);
      case 'disconnect':
        return executeDisconnect(interaction, ctx);
      case 'unlink':
        return executeUnlink(interaction, ctx);
      case 'config':
        return executeConfig(interaction, ctx);
      case 'status':
        return executeStatus(interaction, ctx);
    }
  },
};
