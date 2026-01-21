import {
  ChannelType,
  type Client,
  type EmbedBuilder,
  type MessageMentionOptions,
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
  pingUserInChannel?: boolean;
  content: string | null;
  embeds: EmbedBuilder[];
}): Promise<void> {
  if (input.embeds.length === 0 && (!input.content || input.content.length === 0)) return;

  const embedChunks = chunkArray(input.embeds, 10);
  const dmUserIds = new Set<string>();
  const channelTargets = new Map<
    string,
    { guildId: string; channelId: string; mentionRoleId: string | null; userIds: Set<string> }
  >();

  for (const target of input.targets) {
    if (target.sendDm) dmUserIds.add(target.discordUserId);

    if (target.sendChannel && target.notifyChannelId) {
      const key = `${target.guildId}:${target.notifyChannelId}`;
      const existing = channelTargets.get(key);
      if (existing) {
        existing.userIds.add(target.discordUserId);
        existing.mentionRoleId ??= target.mentionRoleId;
      } else {
        channelTargets.set(key, {
          guildId: target.guildId,
          channelId: target.notifyChannelId,
          mentionRoleId: target.mentionRoleId,
          userIds: new Set([target.discordUserId]),
        });
      }
    }
  }

  await Promise.allSettled(
    Array.from(channelTargets.values()).map(async (target) => {
      const userMentions = input.pingUserInChannel ? Array.from(target.userIds).slice(0, 10) : [];

      const allowedMentions: MessageMentionOptions = {
        parse: [],
        roles: target.mentionRoleId ? [target.mentionRoleId] : [],
        users: userMentions,
      };

      const content =
        [
          target.mentionRoleId ? `<@&${target.mentionRoleId}>` : null,
          ...userMentions.map((userId) => `<@${userId}>`),
          input.content,
        ]
          .filter((value): value is string => !!value && value.length > 0)
          .join(' ')
          .trim() || null;

      for (const [index, embeds] of embedChunks.entries()) {
        await sendToGuildChannel({
          client: input.client,
          guildId: target.guildId,
          channelId: target.channelId,
          content: index === 0 ? content : null,
          embeds,
          allowedMentions: index === 0 ? allowedMentions : { parse: [] },
        });
      }
    }),
  );

  await Promise.allSettled(
    Array.from(dmUserIds).map(async (userId) => {
      for (const [index, embeds] of embedChunks.entries()) {
        await sendToUserDm({
          client: input.client,
          userId,
          content: index === 0 ? input.content : null,
          embeds,
        });
      }
    }),
  );
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [[]];

  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function sendToGuildChannel(input: {
  client: Client;
  guildId: string;
  channelId: string;
  content: string | null;
  embeds: EmbedBuilder[];
  allowedMentions?: MessageMentionOptions;
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
      ...(input.allowedMentions ? { allowedMentions: input.allowedMentions } : {}),
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
