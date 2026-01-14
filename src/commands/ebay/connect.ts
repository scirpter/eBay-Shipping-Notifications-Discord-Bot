import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, type SlashCommandSubcommandBuilder } from 'discord.js';

import type { ChatInputCommandInteraction } from 'discord.js';

import type { CommandContext } from '../../bot/types.js';
import { env } from '../../env.js';
import { signStateToken } from '../../infra/crypto/state-token.js';
import { buildEbayAuthorizeUrl } from '../../infra/ebay/ebay-oauth.js';
import type { EbayOAuthStatePayload } from '../../http/server.js';

export function registerConnect(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
  return sub.setName('connect').setDescription('Connect your eBay seller account');
}

export async function executeConnect(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<void> {
  void ctx;

  if (!interaction.guildId) {
    await interaction.reply({
      content: 'Run this command in a server so I know where to send channel notifications.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const payload: EbayOAuthStatePayload = {
    guildId: interaction.guildId,
    discordUserId: interaction.user.id,
    environment: env.EBAY_ENVIRONMENT,
    expiresAtMs: Date.now() + 10 * 60 * 1000,
  };

  const { token } = signStateToken(payload, env.TOKEN_ENCRYPTION_KEY);
  const url = buildEbayAuthorizeUrl({
    environment: env.EBAY_ENVIRONMENT,
    clientId: env.EBAY_CLIENT_ID,
    redirectUri: env.EBAY_REDIRECT_URI,
    scopes: env.EBAY_OAUTH_SCOPES,
    state: token,
  });

  const button = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Connect eBay').setURL(url);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  await interaction.reply({
    content:
      `Click **Connect eBay** to authorize. After you finish, I will DM you a confirmation.` +
      `\nEnvironment: \`${env.EBAY_ENVIRONMENT}\``,
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}
