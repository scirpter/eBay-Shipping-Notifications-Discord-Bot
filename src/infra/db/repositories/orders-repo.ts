import { and, eq } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';

import type { AppDb } from '../client.js';
import { orders } from '../schema/orders.js';
import { dbError, type DbError } from './db-errors.js';

export type FulfillmentStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'FULFILLED';

export type Order = {
  id: string;
  ebayAccountId: string;
  orderId: string;
  orderCreatedAt: Date | null;
  lastModifiedAt: Date | null;
  fulfillmentStatus: FulfillmentStatus;
  buyerUsername: string | null;
  summary: string;
};

function mapRow(row: typeof orders.$inferSelect): Order {
  return {
    id: row.id,
    ebayAccountId: row.ebayAccountId,
    orderId: row.orderId,
    orderCreatedAt: row.orderCreatedAt ?? null,
    lastModifiedAt: row.lastModifiedAt ?? null,
    fulfillmentStatus: row.fulfillmentStatus,
    buyerUsername: row.buyerUsername ?? null,
    summary: row.summary,
  };
}

export type UpsertOrderInput = Omit<Order, 'id'> & { id: string };

export async function upsertOrder(
  db: AppDb,
  input: UpsertOrderInput,
): Promise<Result<Order, DbError>> {
  try {
    await db
      .insert(orders)
      .values({
        id: input.id,
        ebayAccountId: input.ebayAccountId,
        orderId: input.orderId,
        orderCreatedAt: input.orderCreatedAt ?? null,
        lastModifiedAt: input.lastModifiedAt ?? null,
        fulfillmentStatus: input.fulfillmentStatus,
        buyerUsername: input.buyerUsername ?? null,
        summary: input.summary,
      })
      .onDuplicateKeyUpdate({
        set: {
          lastModifiedAt: input.lastModifiedAt ?? null,
          fulfillmentStatus: input.fulfillmentStatus,
          buyerUsername: input.buyerUsername ?? null,
          summary: input.summary,
        },
      });

    const row = await db.query.orders.findFirst({
      where: and(eq(orders.ebayAccountId, input.ebayAccountId), eq(orders.orderId, input.orderId)),
    });
    if (!row) return err(dbError('Failed to reload order after upsert', new Error('Not found')));

    return ok(mapRow(row));
  } catch (cause) {
    return err(dbError('Failed to upsert order', cause));
  }
}

export async function getOrderByAccountAndOrderId(
  db: AppDb,
  input: { ebayAccountId: string; orderId: string },
): Promise<Result<Order | null, DbError>> {
  try {
    const row = await db.query.orders.findFirst({
      where: and(eq(orders.ebayAccountId, input.ebayAccountId), eq(orders.orderId, input.orderId)),
    });
    return ok(row ? mapRow(row) : null);
  } catch (cause) {
    return err(dbError('Failed to load order', cause));
  }
}
