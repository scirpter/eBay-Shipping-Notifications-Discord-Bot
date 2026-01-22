import { and, eq } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';

import type { AppDb } from '../client.js';
import { ebayAccounts } from '../schema/ebay-accounts.js';
import { guildEbayAccounts } from '../schema/guild-ebay-accounts.js';
import { orders } from '../schema/orders.js';
import { shipmentTrackings } from '../schema/shipment-trackings.js';
import { dbError, type DbError } from './db-errors.js';
import type { EbayEnvironment } from './ebay-accounts-repo.js';

export type UnlinkEbayAccountResult =
  | { unlinked: false }
  | { unlinked: true; ebayAccountId: string; ebayUserId: string; environment: EbayEnvironment };

export async function unlinkEbayAccountForDiscordUser(
  db: AppDb,
  input: { discordUserId: string; environment: EbayEnvironment },
): Promise<Result<UnlinkEbayAccountResult, DbError>> {
  try {
    const result = await db.transaction(async (tx) => {
      const [account] = await tx
        .select({
          id: ebayAccounts.id,
          ebayUserId: ebayAccounts.ebayUserId,
          environment: ebayAccounts.environment,
        })
        .from(ebayAccounts)
        .where(and(eq(ebayAccounts.discordUserId, input.discordUserId), eq(ebayAccounts.environment, input.environment)))
        .limit(1);

      if (!account) return { unlinked: false } as const;

      await tx.delete(guildEbayAccounts).where(eq(guildEbayAccounts.ebayAccountId, account.id));
      await tx.delete(shipmentTrackings).where(eq(shipmentTrackings.ebayAccountId, account.id));
      await tx.delete(orders).where(eq(orders.ebayAccountId, account.id));
      await tx.delete(ebayAccounts).where(eq(ebayAccounts.id, account.id));

      return { unlinked: true, ebayAccountId: account.id, ebayUserId: account.ebayUserId, environment: account.environment } as const;
    });

    return ok(result);
  } catch (cause) {
    return err(dbError('Failed to unlink eBay account', cause));
  }
}
