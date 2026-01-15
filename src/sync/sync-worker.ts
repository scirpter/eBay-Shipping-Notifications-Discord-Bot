import { setTimeout as sleep } from 'node:timers/promises';

import PQueue from 'p-queue';
import pRetry, { AbortError } from 'p-retry';
import type { Client } from 'discord.js';
import { ulid } from 'ulid';

import { env } from '../env.js';
import { createSeventeenTrackClient, getTrackingLastCheckpoint } from '../infra/seventeen-track/seventeen-track-client.js';
import { decryptSecret, encryptSecret } from '../infra/crypto/secretbox.js';
import type { AppDb } from '../infra/db/client.js';
import {
  listAllEbayAccounts,
  updateEbayAccountAccessToken,
  updateEbayAccountSyncMarkers,
  type EbayAccount,
} from '../infra/db/repositories/ebay-accounts-repo.js';
import { listNotificationTargetsForEbayAccount } from '../infra/db/repositories/guild-ebay-accounts-repo.js';
import { upsertOrder } from '../infra/db/repositories/orders-repo.js';
import {
  listShipmentTrackingsForEbayAccount,
  updateShipmentTrackingProgress,
  upsertShipmentTracking,
} from '../infra/db/repositories/shipment-trackings-repo.js';
import { buildOrdersFilter, createEbayApiClient } from '../infra/ebay/ebay-api.js';
import { refreshEbayAccessToken } from '../infra/ebay/ebay-oauth.js';
import { logger } from '../logger.js';
import { notifyDiscordTargets } from '../services/discord-notifier.js';
import { buildTrackingEmbed, type TrackingEventType } from '../ui/tracking-embed.js';

export type SyncWorker = {
  stop: () => Promise<void>;
};

export function startSyncWorker(input: { db: AppDb; discordClient: Client }): SyncWorker {
  const queue = new PQueue({ concurrency: 1 });
  const intervalMs = 60_000;
  let stopping = false;

  const runOnce = async () => {
    const accounts = await listAllEbayAccounts(input.db);
    if (accounts.isErr()) {
      logger.warn({ error: accounts.error }, 'Failed to list eBay accounts');
      return;
    }

    for (const account of accounts.value) {
      await syncAccount({ db: input.db, discordClient: input.discordClient, account });
      if (stopping) return;
      await sleep(250);
    }
  };

  const schedule = () => {
    if (stopping) return;
    if (queue.size > 0 || queue.pending > 0) return;
    void queue.add(runOnce);
  };

  const timer = setInterval(schedule, intervalMs);
  schedule();

  return {
    async stop() {
      stopping = true;
      clearInterval(timer);
      await queue.onIdle();
    },
  };
}

async function syncAccount(input: { db: AppDb; discordClient: Client; account: EbayAccount }): Promise<void> {
  try {
    const accessToken = await getValidAccessToken(input);

    await syncOrders({ ...input, accessToken });

    if (env.SEVENTEENTRACK_API_KEY) {
      await syncTrackings({ ...input });
    } else {
      logger.debug({ accountId: input.account.id }, 'Skipping tracking sync (SEVENTEENTRACK_API_KEY not set)');
    }
  } catch (error) {
    logger.warn({ error, accountId: input.account.id }, 'Account sync failed');
  }
}

async function getValidAccessToken(input: { db: AppDb; account: EbayAccount }): Promise<string> {
  const leewayMs = 60_000;
  const now = Date.now();

  if (input.account.accessTokenEnc && input.account.accessTokenExpiresAt) {
    if (input.account.accessTokenExpiresAt.getTime() - now > leewayMs) {
      return decryptSecret(input.account.accessTokenEnc, env.TOKEN_ENCRYPTION_KEY);
    }
  }

  const refreshToken = decryptSecret(input.account.refreshTokenEnc, env.TOKEN_ENCRYPTION_KEY);

  const tokenResponse = await pRetry(
    async () => {
      try {
        return await refreshEbayAccessToken({
          environment: input.account.environment,
          clientId: env.EBAY_CLIENT_ID,
          clientSecret: env.EBAY_CLIENT_SECRET,
          refreshToken,
          scopes: input.account.scopes,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('HTTP 400') || message.includes('HTTP 401')) {
          throw new AbortError(message);
        }
        throw error;
      }
    },
    { retries: 2 },
  );

  const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);
  const enc = encryptSecret(tokenResponse.access_token, env.TOKEN_ENCRYPTION_KEY);

  const updated = await updateEbayAccountAccessToken(input.db, {
    id: input.account.id,
    accessTokenEnc: enc,
    accessTokenExpiresAt: expiresAt,
  });
  if (updated.isErr()) logger.warn({ error: updated.error }, 'Failed to persist refreshed access token');

  return tokenResponse.access_token;
}

async function syncOrders(input: { db: AppDb; discordClient: Client; account: EbayAccount; accessToken: string }): Promise<void> {
  const api = createEbayApiClient(input.account.environment);

  const from = input.account.lastOrderSyncAt ?? new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);
  const filter = buildOrdersFilter({ lastModifiedFrom: from });

  const now = new Date();
  const limit = 50;
  let offset = 0;
  let totalProcessed = 0;

  while (true) {
    const page = await api.getOrders({ accessToken: input.accessToken, filter, limit, offset });
    if (!page.length) break;

    for (const order of page) {
      totalProcessed += 1;

      const buyer = order.buyer?.username ?? null;
      const title = order.lineItems?.[0]?.title ?? 'Order';
      const summary = `${title}${buyer ? ` • Buyer: ${buyer}` : ''}`;

      await upsertOrder(input.db, {
        id: ulid(),
        ebayAccountId: input.account.id,
        orderId: order.orderId,
        orderCreatedAt: order.creationDate ? new Date(order.creationDate) : null,
        lastModifiedAt: order.lastModifiedDate ? new Date(order.lastModifiedDate) : null,
        fulfillmentStatus: order.orderFulfillmentStatus,
        buyerUsername: buyer,
        summary,
      });

      const fulfillments = await api.getShippingFulfillments({ accessToken: input.accessToken, orderId: order.orderId });
      for (const fulfillment of fulfillments) {
        const trackingNumber = fulfillment.shipmentTrackingNumber;
        if (!trackingNumber) continue;

        await upsertShipmentTracking(input.db, {
          id: ulid(),
          ebayAccountId: input.account.id,
          orderId: order.orderId,
          fulfillmentId: fulfillment.fulfillmentId,
          carrierCode: fulfillment.shippingCarrierCode ?? null,
          trackingNumber,
          provider: 'seventeen-track',
          providerRef: null,
          lastCheckpointAt: null,
          deliveredAt: null,
          lastTag: null,
          lastCheckpointSummary: null,
        });
      }
    }

    if (page.length < limit) break;
    offset += limit;
  }

  const updated = await updateEbayAccountSyncMarkers(input.db, { id: input.account.id, lastOrderSyncAt: now });
  if (updated.isErr()) logger.warn({ error: updated.error, accountId: input.account.id }, 'Failed to update lastOrderSyncAt');

  if (totalProcessed > 0) {
    logger.info({ accountId: input.account.id, totalProcessed }, 'Order sync completed');
  }
}

async function syncTrackings(input: { db: AppDb; discordClient: Client; account: EbayAccount }): Promise<void> {
  if (!env.SEVENTEENTRACK_API_KEY) return;

  const seventeenTrack = createSeventeenTrackClient(env.SEVENTEENTRACK_API_KEY);
  const trackings = await listShipmentTrackingsForEbayAccount(input.db, input.account.id);
  if (trackings.isErr()) return;

  const targets = await listNotificationTargetsForEbayAccount(input.db, input.account.id);
  const notificationTargets = targets.isOk() ? targets.value : [];

  for (const tracking of trackings.value) {
    try {
      const carrier =
        parseCarrierId(tracking.providerRef) ??
        (await ensureSeventeenTrackTracking(seventeenTrack, tracking.trackingNumber).then((value) => value.carrier));

      if (!carrier) continue;

      const live = await seventeenTrack.getTracking({ carrier, trackingNumber: tracking.trackingNumber });
      const current = getTrackingLastCheckpoint(live);

      const eventType = detectTrackingEvent({
        previousDeliveredAt: tracking.deliveredAt,
        previousCheckpointAt: tracking.lastCheckpointAt,
        previousTag: tracking.lastTag,
        currentDeliveredAt: current.deliveredAt,
        currentCheckpointAt: current.checkpointAt,
        currentTag: current.tag,
      });

      if (eventType) {
        const embed = buildTrackingEmbed({
          eventType,
          orderId: tracking.orderId,
          trackingNumber: tracking.trackingNumber,
          carrierCode: tracking.carrierCode,
          checkpointAt: current.checkpointAt,
          deliveredAt: current.deliveredAt,
          tag: current.tag,
          summary: current.summary,
        });

        await notifyDiscordTargets({
          client: input.discordClient,
          targets: notificationTargets,
          content: null,
          embeds: [embed],
        });
      }

      const updated = await updateShipmentTrackingProgress(input.db, {
        id: tracking.id,
        providerRef: String(carrier),
        lastCheckpointAt: current.checkpointAt ?? null,
        deliveredAt: current.deliveredAt ?? null,
        lastTag: current.tag ?? null,
        lastCheckpointSummary: current.summary ?? null,
      });
      if (updated.isErr()) logger.warn({ error: updated.error }, 'Failed to persist tracking progress');
    } catch (error) {
      logger.warn({ error, trackingNumber: tracking.trackingNumber, accountId: input.account.id }, 'Tracking sync failed');
    }
  }

  const updatedAccount = await updateEbayAccountSyncMarkers(input.db, { id: input.account.id, lastTrackingSyncAt: new Date() });
  if (updatedAccount.isErr()) {
    logger.warn({ error: updatedAccount.error }, 'Failed to update lastTrackingSyncAt');
  }
}

function parseCarrierId(value: string | null): number | null {
  if (!value) return null;
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue)) return null;
  if (numberValue <= 0) return null;
  return numberValue;
}

async function ensureSeventeenTrackTracking(
  client: ReturnType<typeof createSeventeenTrackClient>,
  trackingNumber: string,
): Promise<{ carrier: number | null }> {
  try {
    const registered = await client.registerTracking({ trackingNumber });
    return { carrier: registered.carrier ?? null };
  } catch (error) {
    logger.warn({ error, trackingNumber }, 'Failed to register 17TRACK tracking');
    return { carrier: null };
  }
}

function detectTrackingEvent(input: {
  previousDeliveredAt: Date | null;
  previousCheckpointAt: Date | null;
  previousTag: string | null;
  currentDeliveredAt: Date | null;
  currentCheckpointAt: Date | null;
  currentTag: string | null;
}): TrackingEventType | null {
  if (input.currentDeliveredAt && (!input.previousDeliveredAt || input.currentDeliveredAt > input.previousDeliveredAt)) {
    return 'delivered';
  }

  const currentTagNormalized = input.currentTag?.toLowerCase() ?? null;
  const previousTagNormalized = input.previousTag?.toLowerCase() ?? null;
  if (currentTagNormalized === 'delivered' && currentTagNormalized !== previousTagNormalized) {
    return 'delivered';
  }

  if (isDelayTag(input.currentTag) && input.currentTag !== input.previousTag) {
    return 'delay';
  }

  if (input.currentCheckpointAt && !input.previousCheckpointAt) return 'carrier_scan';
  if (
    input.currentCheckpointAt &&
    input.previousCheckpointAt &&
    input.currentCheckpointAt.getTime() > input.previousCheckpointAt.getTime()
  ) {
    return 'movement';
  }

  return null;
}

function isDelayTag(tag: string | null): boolean {
  if (!tag) return false;
  const normalized = tag.toLowerCase();
  return (
    normalized.includes('exception') ||
    normalized.includes('failed') ||
    normalized.includes('expired') ||
    normalized.includes('delay') ||
    normalized.includes('alert')
  );
}
