import { and, eq } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';

import type { AppDb } from '../client.js';
import { ebayAccounts } from '../schema/ebay-accounts.js';
import { dbError, type DbError } from './db-errors.js';

export type EbayEnvironment = 'sandbox' | 'production';

export type EbayAccount = {
  id: string;
  discordUserId: string;
  ebayUserId: string;
  environment: EbayEnvironment;
  scopes: string;
  accessTokenEnc: string | null;
  accessTokenExpiresAt: Date | null;
  refreshTokenEnc: string;
  refreshTokenExpiresAt: Date | null;
  lastOrderSyncAt: Date | null;
  lastTrackingSyncAt: Date | null;
};

function mapRow(row: typeof ebayAccounts.$inferSelect): EbayAccount {
  return {
    id: row.id,
    discordUserId: row.discordUserId,
    ebayUserId: row.ebayUserId,
    environment: row.environment,
    scopes: row.scopes,
    accessTokenEnc: row.accessTokenEnc ?? null,
    accessTokenExpiresAt: row.accessTokenExpiresAt ?? null,
    refreshTokenEnc: row.refreshTokenEnc,
    refreshTokenExpiresAt: row.refreshTokenExpiresAt ?? null,
    lastOrderSyncAt: row.lastOrderSyncAt ?? null,
    lastTrackingSyncAt: row.lastTrackingSyncAt ?? null,
  };
}

export async function getEbayAccountByDiscordUserId(
  db: AppDb,
  discordUserId: string,
  environment: EbayEnvironment,
): Promise<Result<EbayAccount | null, DbError>> {
  try {
    const row = await db.query.ebayAccounts.findFirst({
      where: and(eq(ebayAccounts.discordUserId, discordUserId), eq(ebayAccounts.environment, environment)),
    });
    return ok(row ? mapRow(row) : null);
  } catch (cause) {
    return err(dbError('Failed to load eBay account', cause));
  }
}

export async function getEbayAccountByEbayUserId(
  db: AppDb,
  ebayUserId: string,
  environment: EbayEnvironment,
): Promise<Result<EbayAccount | null, DbError>> {
  try {
    const row = await db.query.ebayAccounts.findFirst({
      where: and(eq(ebayAccounts.ebayUserId, ebayUserId), eq(ebayAccounts.environment, environment)),
    });
    return ok(row ? mapRow(row) : null);
  } catch (cause) {
    return err(dbError('Failed to load eBay account by seller id', cause));
  }
}

export async function getEbayAccountById(
  db: AppDb,
  id: string,
): Promise<Result<EbayAccount | null, DbError>> {
  try {
    const row = await db.query.ebayAccounts.findFirst({
      where: eq(ebayAccounts.id, id),
    });
    return ok(row ? mapRow(row) : null);
  } catch (cause) {
    return err(dbError('Failed to load eBay account', cause));
  }
}

export async function listAllEbayAccounts(
  db: AppDb,
): Promise<Result<EbayAccount[], DbError>> {
  try {
    const rows = await db.select().from(ebayAccounts);
    return ok(rows.map(mapRow));
  } catch (cause) {
    return err(dbError('Failed to list eBay accounts', cause));
  }
}

export type UpsertEbayAccountInput = {
  id: string;
  discordUserId: string;
  ebayUserId: string;
  environment: EbayEnvironment;
  scopes: string;
  accessTokenEnc: string | null;
  accessTokenExpiresAt: Date | null;
  refreshTokenEnc: string;
  refreshTokenExpiresAt: Date | null;
};

export async function upsertEbayAccount(
  db: AppDb,
  input: UpsertEbayAccountInput,
): Promise<Result<EbayAccount, DbError>> {
  try {
    await db
      .insert(ebayAccounts)
      .values({
        id: input.id,
        discordUserId: input.discordUserId,
        ebayUserId: input.ebayUserId,
        environment: input.environment,
        scopes: input.scopes,
        accessTokenEnc: input.accessTokenEnc ?? null,
        accessTokenExpiresAt: input.accessTokenExpiresAt ?? null,
        refreshTokenEnc: input.refreshTokenEnc,
        refreshTokenExpiresAt: input.refreshTokenExpiresAt ?? null,
      })
      .onDuplicateKeyUpdate({
        set: {
          discordUserId: input.discordUserId,
          ebayUserId: input.ebayUserId,
          scopes: input.scopes,
          accessTokenEnc: input.accessTokenEnc ?? null,
          accessTokenExpiresAt: input.accessTokenExpiresAt ?? null,
          refreshTokenEnc: input.refreshTokenEnc,
          refreshTokenExpiresAt: input.refreshTokenExpiresAt ?? null,
        },
      });

    const reloaded = await db.query.ebayAccounts.findFirst({
      where: and(
        eq(ebayAccounts.discordUserId, input.discordUserId),
        eq(ebayAccounts.environment, input.environment),
      ),
    });

    if (!reloaded) return err(dbError('Failed to reload eBay account after upsert', new Error('Not found')));

    return ok(mapRow(reloaded));
  } catch (cause) {
    return err(dbError('Failed to upsert eBay account', cause));
  }
}

export async function updateEbayAccountSyncMarkers(
  db: AppDb,
  input: { id: string; lastOrderSyncAt?: Date; lastTrackingSyncAt?: Date },
): Promise<Result<void, DbError>> {
  try {
    await db
      .update(ebayAccounts)
      .set({
        lastOrderSyncAt: input.lastOrderSyncAt ?? undefined,
        lastTrackingSyncAt: input.lastTrackingSyncAt ?? undefined,
      })
      .where(eq(ebayAccounts.id, input.id));
    return ok(undefined);
  } catch (cause) {
    return err(dbError('Failed to update sync markers', cause));
  }
}

export async function updateEbayAccountAccessToken(
  db: AppDb,
  input: { id: string; accessTokenEnc: string; accessTokenExpiresAt: Date },
): Promise<Result<void, DbError>> {
  try {
    await db
      .update(ebayAccounts)
      .set({
        accessTokenEnc: input.accessTokenEnc,
        accessTokenExpiresAt: input.accessTokenExpiresAt,
      })
      .where(eq(ebayAccounts.id, input.id));
    return ok(undefined);
  } catch (cause) {
    return err(dbError('Failed to update access token', cause));
  }
}
