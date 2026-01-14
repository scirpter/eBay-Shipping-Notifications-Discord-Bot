import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type SlashCommandSubcommandBuilder,
} from 'discord.js';

import type { CommandContext } from '../../bot/types.js';
import { upsertGuildSettings } from '../../infra/db/repositories/guild-settings-repo.js';

export function registerConfig(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
  return sub
    .setName('config')
    .setDescription('Configure where notifications are posted in this server')
    .addChannelOption((opt) =>
      opt
        .setName('channel')
        .setDescription('Channel for shipping notifications')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true),
    )
    .addRoleOption((opt) =>
      opt.setName('mention-role').setDescription('Optional role to mention for notifications').setRequired(false),
    )
    .addBooleanOption((opt) =>
      opt.setName('send-channel').setDescription('Send notifications to the server channel').setRequired(false),
    )
    .addBooleanOption((opt) =>
      opt.setName('send-dm').setDescription('Send notifications to the connected user via DMs').setRequired(false),
    );
}

export async function executeConfig(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'Run this command in a server.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: 'You need the **Manage Server** permission to configure notifications.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const channel = interaction.options.getChannel('channel', true);
  const mentionRole = interaction.options.getRole('mention-role', false);

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply('This command must be run inside a server.');
    return;
  }

  const resolvedChannel = await guild.channels.fetch(channel.id);
  if (!resolvedChannel?.isTextBased()) {
    await interaction.editReply('Please select a text channel I can post to.');
    return;
  }

  const me = guild.members.me;
  if (!me) {
    await interaction.editReply("I couldn't verify my permissions in that channel. Please try again.");
    return;
  }

  const required =
    PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages | PermissionFlagsBits.EmbedLinks;
  const perms = resolvedChannel.permissionsFor(me);
  if (!perms?.has(required)) {
    await interaction.editReply(
      'I need **View Channel**, **Send Messages**, and **Embed Links** permissions in that channel.',
    );
    return;
  }

  const sendChannel = interaction.options.getBoolean('send-channel', false);
  const sendDm = interaction.options.getBoolean('send-dm', false);

  const saved = await upsertGuildSettings(ctx.db, {
    guildId: interaction.guildId,
    notifyChannelId: channel.id,
    mentionRoleId: mentionRole?.id ?? null,
    sendChannel: sendChannel ?? true,
    sendDm: sendDm ?? true,
  });

  if (saved.isErr()) {
    await interaction.editReply('Failed to save settings. Please try again.');
    return;
  }

  await interaction.editReply(
    `Saved.\n- Channel: <#${channel.id}>\n- Send channel: \`${saved.value.sendChannel}\`\n- Send DMs: \`${saved.value.sendDm}\``,
  );
}
