import fastify from 'fastify';
import type { Client } from 'discord.js';
import { ulid } from 'ulid';
import { z } from 'zod';

import { env } from '../env.js';
import { encryptSecret } from '../infra/crypto/secretbox.js';
import { verifyStateToken } from '../infra/crypto/state-token.js';
import type { AppDb } from '../infra/db/client.js';
import { upsertEbayAccount } from '../infra/db/repositories/ebay-accounts-repo.js';
import { upsertGuildEbayAccountLink } from '../infra/db/repositories/guild-ebay-accounts-repo.js';
import { createEbayApiClient } from '../infra/ebay/ebay-api.js';
import { exchangeEbayAuthorizationCode } from '../infra/ebay/ebay-oauth.js';
import { logger } from '../logger.js';

export type EbayOAuthStatePayload = {
  guildId: string;
  discordUserId: string;
  environment: 'sandbox' | 'production';
  expiresAtMs: number;
};

const CallbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
  error_description: z.string().min(1).optional(),
});

export type HttpServer = {
  stop: () => Promise<void>;
};

function htmlPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; padding: 2rem; background: #0b0f17; color: #e5e7eb; }
      .card { max-width: 720px; margin: 0 auto; background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 1.5rem; }
      h1 { margin: 0 0 0.5rem; font-size: 1.25rem; }
      p { margin: 0.25rem 0; line-height: 1.5; color: #d1d5db; }
      code { background: #0b0f17; padding: 0.15rem 0.3rem; border-radius: 6px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${title}</h1>
      ${body}
    </div>
  </body>
</html>`;
}

export async function startHttpServer(input: { db: AppDb; discordClient: Client }): Promise<HttpServer> {
  const server = fastify({ logger: false });

  server.get('/healthz', () => ({ ok: true }));

  server.get('/oauth/ebay/callback', async (request, reply) => {
    const query = CallbackQuerySchema.parse(request.query);

    if (query.error) {
      logger.warn({ error: query.error, description: query.error_description }, 'eBay OAuth error');
      reply.code(400).type('text/html').send(
        htmlPage(
          'eBay connect failed',
          `<p>eBay returned an error: <code>${query.error}</code></p>` +
            (query.error_description ? `<p>${query.error_description}</p>` : '') +
            `<p>You can close this tab and try again in Discord.</p>`,
        ),
      );
      return;
    }

    if (!query.code || !query.state) {
      reply
        .code(400)
        .type('text/html')
        .send(htmlPage('Invalid request', `<p>Missing <code>code</code> or <code>state</code>.</p>`));
      return;
    }

    const payload = verifyStateToken<EbayOAuthStatePayload>(query.state, env.TOKEN_ENCRYPTION_KEY);
    if (!payload) {
      reply.code(400).type('text/html').send(htmlPage('Invalid state', `<p>Invalid or expired state token.</p>`));
      return;
    }

    if (Date.now() > payload.expiresAtMs) {
      reply.code(400).type('text/html').send(htmlPage('Expired', `<p>This login link has expired. Please retry.</p>`));
      return;
    }

    try {
      const tokenResponse = await exchangeEbayAuthorizationCode({
        environment: payload.environment,
        clientId: env.EBAY_CLIENT_ID,
        clientSecret: env.EBAY_CLIENT_SECRET,
        redirectUri: env.EBAY_REDIRECT_URI,
        code: query.code,
      });

      if (!tokenResponse.refresh_token) {
        throw new Error('Missing refresh_token in eBay token response');
      }

      const now = Date.now();
      const accessExpiresAt = new Date(now + tokenResponse.expires_in * 1000);
      const refreshExpiresAt = tokenResponse.refresh_token_expires_in
        ? new Date(now + tokenResponse.refresh_token_expires_in * 1000)
        : null;

      const api = createEbayApiClient(payload.environment);
      let ebayUserId = 'unknown';
      try {
        const recentOrders = await api.getOrders({
          accessToken: tokenResponse.access_token,
          filter: `lastmodifieddate:[${new Date(now - 1000 * 60 * 60 * 24 * 30).toISOString()}..]`,
          limit: 1,
          offset: 0,
        });
        ebayUserId = recentOrders[0]?.sellerId ?? ebayUserId;
      } catch (error) {
        logger.warn({ error }, 'Failed to detect eBay seller id; continuing');
      }

      const saved = await upsertEbayAccount(input.db, {
        id: ulid(),
        discordUserId: payload.discordUserId,
        ebayUserId,
        environment: payload.environment,
        scopes: env.EBAY_OAUTH_SCOPES,
        accessTokenEnc: encryptSecret(tokenResponse.access_token, env.TOKEN_ENCRYPTION_KEY),
        accessTokenExpiresAt: accessExpiresAt,
        refreshTokenEnc: encryptSecret(tokenResponse.refresh_token, env.TOKEN_ENCRYPTION_KEY),
        refreshTokenExpiresAt: refreshExpiresAt,
      });

      if (saved.isErr()) {
        throw new Error(saved.error.message);
      }

      const link = await upsertGuildEbayAccountLink(input.db, {
        id: ulid(),
        guildId: payload.guildId,
        discordUserId: payload.discordUserId,
        ebayAccountId: saved.value.id,
      });

      if (link.isErr()) {
        throw new Error(link.error.message);
      }

      await input.discordClient.users
        .fetch(payload.discordUserId)
        .then((user) =>
          user.send(
            `Connected your eBay account (${payload.environment}). Shipping notifications will be sent to your DMs and to any configured server channels.`,
          ),
        )
        .catch((dmError) => logger.warn({ dmError }, 'Failed to send OAuth confirmation DM'));

      reply
        .code(200)
        .type('text/html')
        .send(
          htmlPage(
            'eBay connected',
            `<p>You're connected. You can close this tab and return to Discord.</p><p>Next: run <code>/ebay config</code> to choose a channel for server notifications.</p>`,
          ),
        );
    } catch (error) {
      logger.error({ error }, 'OAuth callback failed');
      reply
        .code(500)
        .type('text/html')
        .send(htmlPage('Something went wrong', `<p>Connection failed. Please retry in Discord.</p>`));
    }
  });

  await server.listen({ port: env.HTTP_PORT, host: '0.0.0.0' });
  logger.info({ port: env.HTTP_PORT }, 'HTTP server listening');

  return {
    async stop() {
      await server.close();
    },
  };
}
