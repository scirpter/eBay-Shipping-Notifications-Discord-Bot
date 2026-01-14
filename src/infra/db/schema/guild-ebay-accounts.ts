import { mysqlTable, timestamp, unique, varchar } from 'drizzle-orm/mysql-core';

export const guildEbayAccounts = mysqlTable(
  'guild_ebay_accounts',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    discordUserId: varchar('discord_user_id', { length: 32 }).notNull(),
    ebayAccountId: varchar('ebay_account_id', { length: 26 }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    guildUserUnique: unique().on(table.guildId, table.discordUserId),
  }),
);
