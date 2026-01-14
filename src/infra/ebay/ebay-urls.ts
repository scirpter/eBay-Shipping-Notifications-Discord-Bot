import type { EbayEnvironment } from '../db/repositories/ebay-accounts-repo.js';

export function getEbayApiBaseUrl(environment: EbayEnvironment): string {
  return environment === 'sandbox' ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
}

export function getEbayAuthBaseUrl(environment: EbayEnvironment): string {
  return environment === 'sandbox' ? 'https://auth.sandbox.ebay.com' : 'https://auth.ebay.com';
}

export function getEbayOAuthTokenUrl(environment: EbayEnvironment): string {
  return `${getEbayApiBaseUrl(environment)}/identity/v1/oauth2/token`;
}

