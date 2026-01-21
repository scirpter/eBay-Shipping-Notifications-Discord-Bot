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
import {
  listNotificationTargetsForEbayAccount,
  listNotificationTargetsForEbayUserId,
} from '../infra/db/repositories/guild-ebay-accounts-repo.js';
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
  const scheduleSpec = { timeZone: 'America/New_York', hour: 9, minute: 0 };
  const queue = new PQueue({ concurrency: 1 });
  let stopping = false;
  let timer: NodeJS.Timeout | null = null;

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

  const scheduleRunAt = (runAt: Date) => {
    if (stopping) return;

    if (timer) clearTimeout(timer);

    const delayMs = Math.max(0, runAt.getTime() - Date.now());
    timer = setTimeout(() => {
      timer = null;
      if (stopping) return;
      void queue.add(runOnce);
      scheduleRunAt(getNextZonedDailyRunAt(scheduleSpec));
    }, delayMs);

    logger.info({ runAt: runAt.toISOString() }, 'Next sync scheduled');
  };

  const now = new Date();
  const today9am = getZonedRunAtOnSameDay(now, scheduleSpec);
  if (now >= today9am) {
    void queue.add(runOnce);
    scheduleRunAt(getZonedRunAtOnSameDay(addDaysToYmd(getZonedYmd(now, scheduleSpec.timeZone), 1), scheduleSpec));
  } else {
    scheduleRunAt(today9am);
  }

  return {
    async stop() {
      stopping = true;
      if (timer) clearTimeout(timer);
      await queue.onIdle();
    },
  };
}

type Ymd = { year: number; month: number; day: number };

function addDaysToYmd(input: Ymd, amount: number): Ymd {
  const next = new Date(Date.UTC(input.year, input.month - 1, input.day));
  next.setUTCDate(next.getUTCDate() + amount);
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

function getZonedDateTimeParts(date: Date, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const values: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) values[part.type] = part.value;

  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const hour = Number(values.hour);
  const minute = Number(values.minute);
  const second = Number(values.second);

  if (![year, month, day, hour, minute, second].every(Number.isFinite)) {
    throw new Error(`Failed to resolve date parts for timeZone=${timeZone}`);
  }

  return { year, month, day, hour, minute, second };
}

function getZonedYmd(date: Date, timeZone: string): Ymd {
  const parts = getZonedDateTimeParts(date, timeZone);
  return { year: parts.year, month: parts.month, day: parts.day };
}

function zonedDateTimeToUtc(input: { year: number; month: number; day: number; hour: number; minute: number; second: number }, timeZone: string): Date {
  const desiredUtc = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, input.second);
  let guess = desiredUtc;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const actual = getZonedDateTimeParts(new Date(guess), timeZone);
    const actualUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    const diff = desiredUtc - actualUtc;
    guess += diff;
    if (diff === 0) break;
  }

  return new Date(guess);
}

function getZonedRunAtOnSameDay(
  dateOrYmd: Date | Ymd,
  spec: { timeZone: string; hour: number; minute: number },
): Date {
  const ymd = dateOrYmd instanceof Date ? getZonedYmd(dateOrYmd, spec.timeZone) : dateOrYmd;
  return zonedDateTimeToUtc({ ...ymd, hour: spec.hour, minute: spec.minute, second: 0 }, spec.timeZone);
}

function getNextZonedDailyRunAt(spec: { timeZone: string; hour: number; minute: number }): Date {
  const now = new Date();
  const today = getZonedRunAtOnSameDay(now, spec);
  if (today.getTime() > now.getTime()) return today;

  const tomorrowYmd = addDaysToYmd(getZonedYmd(now, spec.timeZone), 1);
  return getZonedRunAtOnSameDay(tomorrowYmd, spec);
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

  const targets = isKnownEbayUserId(input.account.ebayUserId)
    ? await listNotificationTargetsForEbayUserId(input.db, {
        environment: input.account.environment,
        ebayUserId: input.account.ebayUserId,
      })
    : await listNotificationTargetsForEbayAccount(input.db, input.account.id);
  const notificationTargets = targets.isOk() ? targets.value : [];
  const pendingEmbeds: ReturnType<typeof buildTrackingEmbed>[] = [];
  let pingUserInChannel = false;

  for (const tracking of trackings.value) {
    try {
      const carrierFromDb = parseCarrierId(tracking.providerRef);
      let carrier =
        carrierFromDb ?? (await ensureSeventeenTrackTracking(seventeenTrack, tracking.trackingNumber).then((value) => value.carrier));

      if (!carrier) continue;

      if (tracking.providerRef !== String(carrier)) {
        const updated = await updateShipmentTrackingProgress(input.db, { id: tracking.id, providerRef: String(carrier) });
        if (updated.isErr()) logger.warn({ error: updated.error }, 'Failed to persist tracking providerRef');
      }

      let live = await seventeenTrack.getTracking({ carrier, trackingNumber: tracking.trackingNumber });
      if (!live && carrierFromDb) {
        const refreshed = await ensureSeventeenTrackTracking(seventeenTrack, tracking.trackingNumber);
        if (refreshed.carrier && refreshed.carrier !== carrier) {
          carrier = refreshed.carrier;
          const updated = await updateShipmentTrackingProgress(input.db, {
            id: tracking.id,
            providerRef: String(refreshed.carrier),
          });
          if (updated.isErr()) logger.warn({ error: updated.error }, 'Failed to persist refreshed tracking providerRef');
          live = await seventeenTrack.getTracking({ carrier, trackingNumber: tracking.trackingNumber });
        }
      }

      if (!live) continue;
      const current = getTrackingLastCheckpoint(live);

      const detectedEventType = detectTrackingEvent({
        previousDeliveredAt: tracking.deliveredAt,
        previousCheckpointAt: tracking.lastCheckpointAt,
        previousTag: tracking.lastTag,
        currentDeliveredAt: current.deliveredAt,
        currentCheckpointAt: current.checkpointAt,
        currentTag: current.tag,
      });

      const cutoff =
        input.account.lastTrackingSyncAt && input.account.lastTrackingSyncAt.getTime() > tracking.createdAt.getTime()
          ? input.account.lastTrackingSyncAt
          : tracking.createdAt;

      const deliveredAtForGuard = current.deliveredAt ?? current.checkpointAt;
      const suppressDelivered =
        detectedEventType === 'delivered' &&
        tracking.deliveredAt === null &&
        (input.account.lastTrackingSyncAt === null ||
          (deliveredAtForGuard !== null && deliveredAtForGuard.getTime() <= cutoff.getTime()));

      const eventType = suppressDelivered ? null : detectedEventType;

      if (eventType) {
        const embed = buildTrackingEmbed({
          eventType,
          orderId: tracking.orderId,
          trackingNumber: tracking.trackingNumber,
          carrierCode: current.carrierName ?? tracking.carrierCode,
          checkpointAt: current.checkpointAt,
          deliveredAt: current.deliveredAt,
          tag: current.tag,
          summary: current.summary,
        });

        if (eventType === 'delay') {
          pingUserInChannel = true;
        }
        pendingEmbeds.push(embed);
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

  if (pendingEmbeds.length > 0) {
    await notifyDiscordTargets({
      client: input.discordClient,
      targets: notificationTargets,
      pingUserInChannel,
      content: null,
      embeds: pendingEmbeds,
    });
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

function isKnownEbayUserId(value: string): boolean {
  const normalized = value.trim();
  return normalized.length > 0 && normalized !== 'unknown';
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
