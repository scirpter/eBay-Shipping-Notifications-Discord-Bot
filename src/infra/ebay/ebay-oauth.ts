import { z } from 'zod';

import type { EbayEnvironment } from '../db/repositories/ebay-accounts-repo.js';
import { fetchJson } from '../http/fetch-json.js';
import { getEbayAuthBaseUrl, getEbayOAuthTokenUrl } from './ebay-urls.js';

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).optional(),
  refresh_token_expires_in: z.number().int().positive().optional(),
  token_type: z.string().min(1),
});

export type EbayTokenResponse = z.infer<typeof TokenResponseSchema>;

export function buildEbayAuthorizeUrl(input: {
  environment: EbayEnvironment;
  clientId: string;
  redirectUri: string;
  scopes: string;
  state: string;
}): string {
  const url = new URL(`${getEbayAuthBaseUrl(input.environment)}/oauth2/authorize`);
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('scope', input.scopes);
  url.searchParams.set('state', input.state);
  return url.toString();
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  const token = Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64');
  return `Basic ${token}`;
}

export async function exchangeEbayAuthorizationCode(input: {
  environment: EbayEnvironment;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<EbayTokenResponse> {
  const tokenUrl = getEbayOAuthTokenUrl(input.environment);

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: input.redirectUri,
  });

  const response = await fetchJson<unknown>(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(input.clientId, input.clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  return TokenResponseSchema.parse(response.data);
}

export async function refreshEbayAccessToken(input: {
  environment: EbayEnvironment;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  scopes: string;
}): Promise<EbayTokenResponse> {
  const tokenUrl = getEbayOAuthTokenUrl(input.environment);

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: input.refreshToken,
    scope: input.scopes,
  });

  const response = await fetchJson<unknown>(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(input.clientId, input.clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  return TokenResponseSchema.parse(response.data);
}

