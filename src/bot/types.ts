import type {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';

import type { AppDb } from '../infra/db/client.js';

export type CommandContext = {
  db: AppDb;
};

export type CommandData =
  | SlashCommandBuilder
  | SlashCommandSubcommandsOnlyBuilder
  | SlashCommandOptionsOnlyBuilder;

export type Command = {
  data: CommandData;
  execute: (interaction: ChatInputCommandInteraction, ctx: CommandContext) => Promise<void>;
};
