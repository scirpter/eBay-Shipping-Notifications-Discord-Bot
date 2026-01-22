import { MessageFlags, type ChatInputCommandInteraction, type SlashCommandSubcommandBuilder } from 'discord.js';

import type { CommandContext } from '../../bot/types.js';
import { env } from '../../env.js';
import { unlinkEbayAccountForDiscordUser } from '../../infra/db/repositories/ebay-account-unlink-repo.js';

export function registerUnlink(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
  return sub
    .setName('unlink')
    .setDescription('Unlink your connected eBay seller account (removes all server connections)')
    .addStringOption((opt) =>
      opt
        .setName('confirm')
        .setDescription('Type UNLINK to confirm (this deletes your stored tokens and tracking history)')
        .setRequired(true),
    );
}

export async function executeUnlink(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<void> {
  const confirm = interaction.options.getString('confirm', true);
  if (confirm !== 'UNLINK') {
    const content = 'To unlink your account, rerun this command and set `confirm` to `UNLINK`.';
    await interaction.reply(interaction.guildId ? { content, flags: MessageFlags.Ephemeral } : { content });
    return;
  }

  await interaction.deferReply(interaction.guildId ? { flags: MessageFlags.Ephemeral } : undefined);

  const result = await unlinkEbayAccountForDiscordUser(ctx.db, {
    discordUserId: interaction.user.id,
    environment: env.EBAY_ENVIRONMENT,
  });

  if (result.isErr()) {
    await interaction.editReply('Failed to unlink your account. Please try again.');
    return;
  }

  if (!result.value.unlinked) {
    await interaction.editReply("You're not connected.");
    return;
  }

  await interaction.editReply(
    `Unlinked your eBay account (\`${result.value.ebayUserId}\`). You can run \`/ebay connect\` again to reconnect.`,
  );
}

