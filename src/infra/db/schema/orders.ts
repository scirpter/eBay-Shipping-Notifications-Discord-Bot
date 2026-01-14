import { datetime, mysqlEnum, mysqlTable, text, timestamp, unique, varchar } from 'drizzle-orm/mysql-core';

export const orders = mysqlTable(
  'orders',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    ebayAccountId: varchar('ebay_account_id', { length: 26 }).notNull(),
    orderId: varchar('order_id', { length: 128 }).notNull(),
    orderCreatedAt: datetime('order_created_at', { mode: 'date' }),
    lastModifiedAt: datetime('last_modified_at', { mode: 'date' }),
    fulfillmentStatus: mysqlEnum('fulfillment_status', ['NOT_STARTED', 'IN_PROGRESS', 'FULFILLED']).notNull(),
    buyerUsername: varchar('buyer_username', { length: 128 }),
    summary: text('summary').notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    accountOrderUnique: unique().on(table.ebayAccountId, table.orderId),
  }),
);
