import { and, eq } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';

import type { AppDb } from '../client.js';
import { shipmentTrackings } from '../schema/shipment-trackings.js';
import { dbError, type DbError } from './db-errors.js';

export type ShipmentTracking = {
  id: string;
  ebayAccountId: string;
  orderId: string;
  fulfillmentId: string | null;
  carrierCode: string | null;
  trackingNumber: string;
  provider: 'aftership' | 'seventeen-track';
  providerRef: string | null;
  lastCheckpointAt: Date | null;
  deliveredAt: Date | null;
  lastTag: string | null;
  lastCheckpointSummary: string | null;
};

function mapRow(row: typeof shipmentTrackings.$inferSelect): ShipmentTracking {
  return {
    id: row.id,
    ebayAccountId: row.ebayAccountId,
    orderId: row.orderId,
    fulfillmentId: row.fulfillmentId ?? null,
    carrierCode: row.carrierCode ?? null,
    trackingNumber: row.trackingNumber,
    provider: row.provider,
    providerRef: row.providerRef ?? null,
    lastCheckpointAt: row.lastCheckpointAt ?? null,
    deliveredAt: row.deliveredAt ?? null,
    lastTag: row.lastTag ?? null,
    lastCheckpointSummary: row.lastCheckpointSummary ?? null,
  };
}

export type UpsertShipmentTrackingInput = Omit<ShipmentTracking, 'id'> & { id: string };

export async function upsertShipmentTracking(
  db: AppDb,
  input: UpsertShipmentTrackingInput,
): Promise<Result<ShipmentTracking, DbError>> {
  try {
    await db
      .insert(shipmentTrackings)
      .values({
        id: input.id,
        ebayAccountId: input.ebayAccountId,
        orderId: input.orderId,
        fulfillmentId: input.fulfillmentId ?? null,
        carrierCode: input.carrierCode ?? null,
        trackingNumber: input.trackingNumber,
        provider: input.provider,
        providerRef: input.providerRef ?? null,
        lastCheckpointAt: input.lastCheckpointAt ?? null,
        deliveredAt: input.deliveredAt ?? null,
        lastTag: input.lastTag ?? null,
        lastCheckpointSummary: input.lastCheckpointSummary ?? null,
      })
      .onDuplicateKeyUpdate({
        set: {
          orderId: input.orderId,
          fulfillmentId: input.fulfillmentId ?? null,
          carrierCode: input.carrierCode ?? null,
          provider: input.provider,
        },
      });

    const row = await db.query.shipmentTrackings.findFirst({
      where: and(
        eq(shipmentTrackings.ebayAccountId, input.ebayAccountId),
        eq(shipmentTrackings.trackingNumber, input.trackingNumber),
      ),
    });
    if (!row) return err(dbError('Failed to reload tracking after upsert', new Error('Not found')));

    return ok(mapRow(row));
  } catch (cause) {
    return err(dbError('Failed to upsert shipment tracking', cause));
  }
}

export async function updateShipmentTrackingProgress(
  db: AppDb,
  input: {
    id: string;
    providerRef?: string | null;
    lastCheckpointAt?: Date | null;
    deliveredAt?: Date | null;
    lastTag?: string | null;
    lastCheckpointSummary?: string | null;
  },
): Promise<Result<void, DbError>> {
  try {
    await db
      .update(shipmentTrackings)
      .set({
        providerRef: input.providerRef ?? undefined,
        lastCheckpointAt: input.lastCheckpointAt ?? undefined,
        deliveredAt: input.deliveredAt ?? undefined,
        lastTag: input.lastTag ?? undefined,
        lastCheckpointSummary: input.lastCheckpointSummary ?? undefined,
      })
      .where(eq(shipmentTrackings.id, input.id));
    return ok(undefined);
  } catch (cause) {
    return err(dbError('Failed to update tracking progress', cause));
  }
}

export async function getShipmentTrackingByAccountAndNumber(
  db: AppDb,
  input: { ebayAccountId: string; trackingNumber: string },
): Promise<Result<ShipmentTracking | null, DbError>> {
  try {
    const row = await db.query.shipmentTrackings.findFirst({
      where: and(
        eq(shipmentTrackings.ebayAccountId, input.ebayAccountId),
        eq(shipmentTrackings.trackingNumber, input.trackingNumber),
      ),
    });
    return ok(row ? mapRow(row) : null);
  } catch (cause) {
    return err(dbError('Failed to load shipment tracking', cause));
  }
}

export async function listShipmentTrackingsForEbayAccount(
  db: AppDb,
  ebayAccountId: string,
): Promise<Result<ShipmentTracking[], DbError>> {
  try {
    const rows = await db.select().from(shipmentTrackings).where(eq(shipmentTrackings.ebayAccountId, ebayAccountId));
    return ok(rows.map(mapRow));
  } catch (cause) {
    return err(dbError('Failed to list shipment trackings', cause));
  }
}
