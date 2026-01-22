import { and, eq } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';

import type { AppDb } from '../client.js';
import { guildEbayAccounts } from '../schema/guild-ebay-accounts.js';
import { guildSettings } from '../schema/guild-settings.js';
import { dbError, type DbError } from './db-errors.js';

export type GuildEbayAccountLink = {
  id: string;
  guildId: string;
  discordUserId: string;
  ebayAccountId: string;
};

export type NotificationTarget = {
  guildId: string;
  discordUserId: string;
  notifyChannelId: string | null;
  mentionRoleId: string | null;
  sendChannel: boolean;
  sendDm: boolean;
};

export async function getGuildEbayAccountLink(
  db: AppDb,
  input: { guildId: string; discordUserId: string },
): Promise<Result<GuildEbayAccountLink | null, DbError>> {
  try {
    const row = await db.query.guildEbayAccounts.findFirst({
      where: and(
        eq(guildEbayAccounts.guildId, input.guildId),
        eq(guildEbayAccounts.discordUserId, input.discordUserId),
      ),
    });
    if (!row) return ok(null);

    return ok({
      id: row.id,
      guildId: row.guildId,
      discordUserId: row.discordUserId,
      ebayAccountId: row.ebayAccountId,
    });
  } catch (cause) {
    return err(dbError('Failed to load guild eBay link', cause));
  }
}

export async function deleteGuildEbayAccountLink(
  db: AppDb,
  input: { guildId: string; discordUserId: string },
): Promise<Result<void, DbError>> {
  try {
    await db
      .delete(guildEbayAccounts)
      .where(
        and(
          eq(guildEbayAccounts.guildId, input.guildId),
          eq(guildEbayAccounts.discordUserId, input.discordUserId),
        ),
      );
    return ok(undefined);
  } catch (cause) {
    return err(dbError('Failed to delete guild eBay link', cause));
  }
}

export async function upsertGuildEbayAccountLink(
  db: AppDb,
  link: GuildEbayAccountLink,
): Promise<Result<GuildEbayAccountLink, DbError>> {
  try {
    await db
      .insert(guildEbayAccounts)
      .values({
        id: link.id,
        guildId: link.guildId,
        discordUserId: link.discordUserId,
        ebayAccountId: link.ebayAccountId,
      })
      .onDuplicateKeyUpdate({
        set: {
          ebayAccountId: link.ebayAccountId,
        },
      });

    const row = await db.query.guildEbayAccounts.findFirst({
      where: and(
        eq(guildEbayAccounts.guildId, link.guildId),
        eq(guildEbayAccounts.discordUserId, link.discordUserId),
      ),
    });
    if (!row) return err(dbError('Failed to reload guild eBay link after upsert', new Error('Not found')));

    return ok({
      id: row.id,
      guildId: row.guildId,
      discordUserId: row.discordUserId,
      ebayAccountId: row.ebayAccountId,
    });
  } catch (cause) {
    return err(dbError('Failed to save guild eBay link', cause));
  }
}

export async function listNotificationTargetsForEbayAccount(
  db: AppDb,
  ebayAccountId: string,
): Promise<Result<NotificationTarget[], DbError>> {
  try {
    const rows = await db
      .select({
        guildId: guildEbayAccounts.guildId,
        discordUserId: guildEbayAccounts.discordUserId,
        notifyChannelId: guildSettings.notifyChannelId,
        mentionRoleId: guildSettings.mentionRoleId,
        sendChannel: guildSettings.sendChannel,
        sendDm: guildSettings.sendDm,
      })
      .from(guildEbayAccounts)
      .leftJoin(guildSettings, eq(guildSettings.guildId, guildEbayAccounts.guildId))
      .where(eq(guildEbayAccounts.ebayAccountId, ebayAccountId));

    return ok(
      rows.map((row) => ({
        guildId: row.guildId,
        discordUserId: row.discordUserId,
        notifyChannelId: row.notifyChannelId ?? null,
        mentionRoleId: row.mentionRoleId ?? null,
        sendChannel: row.sendChannel ?? true,
        sendDm: row.sendDm ?? true,
      })),
    );
  } catch (cause) {
    return err(dbError('Failed to list notification targets', cause));
  }
}
