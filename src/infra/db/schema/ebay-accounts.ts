import { datetime, mysqlEnum, mysqlTable, text, timestamp, unique, varchar } from 'drizzle-orm/mysql-core';

export const ebayAccounts = mysqlTable(
  'ebay_accounts',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    discordUserId: varchar('discord_user_id', { length: 32 }).notNull(),
    ebayUserId: varchar('ebay_user_id', { length: 128 }).notNull(),
    environment: mysqlEnum('environment', ['sandbox', 'production']).notNull(),
    scopes: text('scopes').notNull(),

    accessTokenEnc: text('access_token_enc'),
    accessTokenExpiresAt: datetime('access_token_expires_at', { mode: 'date' }),
    refreshTokenEnc: text('refresh_token_enc').notNull(),
    refreshTokenExpiresAt: datetime('refresh_token_expires_at', { mode: 'date' }),

    lastOrderSyncAt: datetime('last_order_sync_at', { mode: 'date' }),
    lastTrackingSyncAt: datetime('last_tracking_sync_at', { mode: 'date' }),

    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    environmentDiscordUserIdUnique: unique().on(table.environment, table.discordUserId),
  }),
);
