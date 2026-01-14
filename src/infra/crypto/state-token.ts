import { createHmac, timingSafeEqual } from 'node:crypto';

import { toBase64Url, fromBase64Url } from './base64url.js';
import { deriveKey32Bytes } from './key-derivation.js';

export type SignedStateToken<TPayload extends object> = {
  token: string;
  payload: TPayload;
};

export function signStateToken<TPayload extends object>(
  payload: TPayload,
  secretKey: string,
): SignedStateToken<TPayload> {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const bodyB64 = toBase64Url(body);

  const signature = createHmac('sha256', deriveKey32Bytes(secretKey)).update(bodyB64).digest();
  const signatureB64 = toBase64Url(signature);

  return {
    token: `${bodyB64}.${signatureB64}`,
    payload,
  };
}

export function verifyStateToken<TPayload extends object>(
  token: string,
  secretKey: string,
): TPayload | null {
  const [bodyB64, signatureB64] = token.split('.');
  if (!bodyB64 || !signatureB64) return null;

  const signature = fromBase64Url(signatureB64);
  const expectedSignature = createHmac('sha256', deriveKey32Bytes(secretKey)).update(bodyB64).digest();

  if (signature.length !== expectedSignature.length) return null;
  if (!timingSafeEqual(signature, expectedSignature)) return null;

  try {
    const body = fromBase64Url(bodyB64).toString('utf8');
    return JSON.parse(body) as TPayload;
  } catch {
    return null;
  }
}

