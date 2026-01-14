import { boolean, mysqlTable, timestamp, varchar } from 'drizzle-orm/mysql-core';

export const guildSettings = mysqlTable('guild_settings', {
  guildId: varchar('guild_id', { length: 32 }).primaryKey(),
  notifyChannelId: varchar('notify_channel_id', { length: 32 }),
  mentionRoleId: varchar('mention_role_id', { length: 32 }),
  sendChannel: boolean('send_channel').notNull().default(true),
  sendDm: boolean('send_dm').notNull().default(true),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow().onUpdateNow(),
});
