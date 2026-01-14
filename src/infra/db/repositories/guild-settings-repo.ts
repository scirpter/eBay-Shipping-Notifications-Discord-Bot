import { eq } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';

import type { AppDb } from '../client.js';
import { guildSettings } from '../schema/guild-settings.js';
import { dbError, type DbError } from './db-errors.js';

export type GuildSettings = {
  guildId: string;
  notifyChannelId: string | null;
  mentionRoleId: string | null;
  sendChannel: boolean;
  sendDm: boolean;
};

export async function getGuildSettingsByGuildId(
  db: AppDb,
  guildId: string,
): Promise<Result<GuildSettings | null, DbError>> {
  try {
    const row = await db.query.guildSettings.findFirst({
      where: eq(guildSettings.guildId, guildId),
    });

    if (!row) return ok(null);

    return ok({
      guildId: row.guildId,
      notifyChannelId: row.notifyChannelId ?? null,
      mentionRoleId: row.mentionRoleId ?? null,
      sendChannel: row.sendChannel,
      sendDm: row.sendDm,
    });
  } catch (cause) {
    return err(dbError('Failed to load guild settings', cause));
  }
}

export async function upsertGuildSettings(
  db: AppDb,
  settings: GuildSettings,
): Promise<Result<GuildSettings, DbError>> {
  try {
    await db
      .insert(guildSettings)
      .values({
        guildId: settings.guildId,
        notifyChannelId: settings.notifyChannelId ?? null,
        mentionRoleId: settings.mentionRoleId ?? null,
        sendChannel: settings.sendChannel,
        sendDm: settings.sendDm,
      })
      .onDuplicateKeyUpdate({
        set: {
          notifyChannelId: settings.notifyChannelId ?? null,
          mentionRoleId: settings.mentionRoleId ?? null,
          sendChannel: settings.sendChannel,
          sendDm: settings.sendDm,
        },
      });

    return ok(settings);
  } catch (cause) {
    return err(dbError('Failed to save guild settings', cause));
  }
}
