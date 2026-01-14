import {
  ChannelType,
  type Client,
  type EmbedBuilder,
  PermissionFlagsBits,
  type TextBasedChannel,
  type GuildTextBasedChannel,
} from 'discord.js';

import { logger } from '../logger.js';

export type NotificationTarget = {
  guildId: string;
  discordUserId: string;
  notifyChannelId: string | null;
  mentionRoleId: string | null;
  sendChannel: boolean;
  sendDm: boolean;
};

function isGuildTextChannel(channel: TextBasedChannel): channel is GuildTextBasedChannel {
  return (channel as GuildTextBasedChannel).guild !== undefined;
}

export async function notifyDiscordTargets(input: {
  client: Client;
  targets: NotificationTarget[];
  content: string | null;
  embeds: EmbedBuilder[];
}): Promise<void> {
  const dmUserIds = new Set<string>();

  await Promise.allSettled(
    input.targets.map(async (target) => {
      if (target.sendDm) dmUserIds.add(target.discordUserId);

      if (target.sendChannel && target.notifyChannelId) {
        await sendToGuildChannel({
          client: input.client,
          guildId: target.guildId,
          channelId: target.notifyChannelId,
          content: [target.mentionRoleId ? `<@&${target.mentionRoleId}>` : null, input.content]
            .filter((value): value is string => !!value && value.length > 0)
            .join(' ')
            .trim() || null,
          embeds: input.embeds,
        });
      }
    }),
  );

  await Promise.allSettled(
    Array.from(dmUserIds).map(async (userId) =>
      sendToUserDm({ client: input.client, userId, content: input.content, embeds: input.embeds }),
    ),
  );
}

async function sendToGuildChannel(input: {
  client: Client;
  guildId: string;
  channelId: string;
  content: string | null;
  embeds: EmbedBuilder[];
}): Promise<void> {
  try {
    const channel = await input.client.channels.fetch(input.channelId);
    if (!channel) {
      logger.warn({ channelId: input.channelId, guildId: input.guildId }, 'Notification channel not found');
      return;
    }

    if (!channel.isTextBased() || channel.type === ChannelType.DM) {
      logger.warn({ channelId: input.channelId, guildId: input.guildId }, 'Notification channel not text-based');
      return;
    }

    if (!isGuildTextChannel(channel)) return;

    const me = channel.guild.members.me;
    if (!me) return;

    const permissions = channel.permissionsFor(me);
    const required = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages | PermissionFlagsBits.EmbedLinks;
    if (!permissions || !permissions.has(required)) {
      logger.warn(
        { channelId: input.channelId, guildId: input.guildId },
        'Missing permissions to send notification',
      );
      return;
    }

    await channel.send({
      ...(input.content ? { content: input.content } : {}),
      embeds: input.embeds,
    });
  } catch (error) {
    logger.warn({ error, channelId: input.channelId, guildId: input.guildId }, 'Failed to send channel notification');
  }
}

async function sendToUserDm(input: {
  client: Client;
  userId: string;
  content: string | null;
  embeds: EmbedBuilder[];
}): Promise<void> {
  try {
    const user = await input.client.users.fetch(input.userId);
    await user.send({
      ...(input.content ? { content: input.content } : {}),
      embeds: input.embeds,
    });
  } catch (error) {
    logger.warn({ error, userId: input.userId }, 'Failed to send DM notification');
  }
}
