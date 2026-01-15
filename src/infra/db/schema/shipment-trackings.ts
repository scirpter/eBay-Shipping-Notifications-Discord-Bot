import { datetime, mysqlEnum, mysqlTable, text, timestamp, unique, varchar } from 'drizzle-orm/mysql-core';

export const shipmentTrackings = mysqlTable(
  'shipment_trackings',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    ebayAccountId: varchar('ebay_account_id', { length: 26 }).notNull(),
    orderId: varchar('order_id', { length: 128 }).notNull(),
    fulfillmentId: varchar('fulfillment_id', { length: 128 }),
    carrierCode: varchar('carrier_code', { length: 64 }),
    trackingNumber: varchar('tracking_number', { length: 128 }).notNull(),
    provider: mysqlEnum('provider', ['aftership', 'seventeen-track']).notNull().default('seventeen-track'),
    providerRef: varchar('provider_ref', { length: 128 }),
    lastCheckpointAt: datetime('last_checkpoint_at', { mode: 'date' }),
    deliveredAt: datetime('delivered_at', { mode: 'date' }),
    lastTag: varchar('last_tag', { length: 64 }),
    lastCheckpointSummary: text('last_checkpoint_summary'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    accountTrackingUnique: unique().on(table.ebayAccountId, table.trackingNumber),
  }),
);
