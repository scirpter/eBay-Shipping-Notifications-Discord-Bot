import { MessageFlags, type ChatInputCommandInteraction, type SlashCommandSubcommandBuilder } from 'discord.js';

import type { CommandContext } from '../../bot/types.js';
import { env } from '../../env.js';
import { getEbayAccountById } from '../../infra/db/repositories/ebay-accounts-repo.js';
import { getGuildEbayAccountLink } from '../../infra/db/repositories/guild-ebay-accounts-repo.js';
import { getGuildSettingsByGuildId } from '../../infra/db/repositories/guild-settings-repo.js';
import { listShipmentTrackingsForEbayAccount } from '../../infra/db/repositories/shipment-trackings-repo.js';

export function registerStatus(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
  return sub.setName('status').setDescription('Show your current connection and notification settings');
}

export async function executeStatus(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'Run this command in a server.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const link = await getGuildEbayAccountLink(ctx.db, {
    guildId: interaction.guildId,
    discordUserId: interaction.user.id,
  });

  if (link.isErr()) {
    await interaction.editReply('Failed to load status. Please try again.');
    return;
  }

  const settings = await getGuildSettingsByGuildId(ctx.db, interaction.guildId);
  if (settings.isErr()) {
    await interaction.editReply('Failed to load server settings. Please try again.');
    return;
  }

  const lines: string[] = [];
  lines.push(`Environment: \`${env.EBAY_ENVIRONMENT}\``);
  lines.push(`Tracking provider: \`${env.SEVENTEENTRACK_API_KEY ? '17track' : 'not configured'}\``);

  if (!link.value) {
    lines.push(`Connected: \`false\``);
    lines.push(`Channel: ${settings.value?.notifyChannelId ? `<#${settings.value.notifyChannelId}>` : '`not set`'}`);
    await interaction.editReply(lines.join('\n'));
    return;
  }

  const account = await getEbayAccountById(ctx.db, link.value.ebayAccountId);
  if (account.isErr() || !account.value) {
    lines.push('Connected: `true` (account record missing)');
    await interaction.editReply(lines.join('\n'));
    return;
  }

  const trackings = await listShipmentTrackingsForEbayAccount(ctx.db, account.value.id);
  const trackingCount = trackings.isOk() ? trackings.value.length : 0;

  lines.push(`Connected: \`true\``);
  lines.push(`Seller id: \`${account.value.ebayUserId}\``);
  lines.push(`Last order sync: ${account.value.lastOrderSyncAt ? `\`${account.value.lastOrderSyncAt.toISOString()}\`` : '`never`'}`);
  lines.push(
    `Last tracking sync: ${
      account.value.lastTrackingSyncAt ? `\`${account.value.lastTrackingSyncAt.toISOString()}\`` : '`never`'
    }`,
  );
  lines.push(`Known trackings: \`${trackingCount}\``);

  lines.push(`Channel: ${settings.value?.notifyChannelId ? `<#${settings.value.notifyChannelId}>` : '`not set`'}`);
  lines.push(`Send channel: \`${settings.value?.sendChannel ?? true}\``);
  lines.push(`Send DMs: \`${settings.value?.sendDm ?? true}\``);

  await interaction.editReply(lines.join('\n'));
}
