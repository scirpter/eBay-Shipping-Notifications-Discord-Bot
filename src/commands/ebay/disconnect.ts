import { MessageFlags, type SlashCommandSubcommandBuilder } from 'discord.js';

import type { ChatInputCommandInteraction } from 'discord.js';

import type { CommandContext } from '../../bot/types.js';
import { deleteGuildEbayAccountLink, getGuildEbayAccountLink } from '../../infra/db/repositories/guild-ebay-accounts-repo.js';

export function registerDisconnect(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
  return sub.setName('disconnect').setDescription('Disconnect your eBay account from this server');
}

export async function executeDisconnect(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'Run this command in a server.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const existing = await getGuildEbayAccountLink(ctx.db, {
    guildId: interaction.guildId,
    discordUserId: interaction.user.id,
  });

  if (existing.isErr()) {
    await interaction.editReply('Failed to check your connection status. Please try again.');
    return;
  }

  if (!existing.value) {
    await interaction.editReply("You're not connected in this server.");
    return;
  }

  const deleted = await deleteGuildEbayAccountLink(ctx.db, {
    guildId: interaction.guildId,
    discordUserId: interaction.user.id,
  });

  if (deleted.isErr()) {
    await interaction.editReply('Failed to disconnect. Please try again.');
    return;
  }

  await interaction.editReply('Disconnected your eBay account from this server.');
}

