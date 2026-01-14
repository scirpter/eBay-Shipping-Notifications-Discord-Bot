import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { toBase64Url, fromBase64Url } from './base64url.js';
import { deriveKey32Bytes } from './key-derivation.js';

const VERSION = 'v1';

export function encryptSecret(plaintext: string, secretKey: string): string {
  const key = deriveKey32Bytes(secretKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${VERSION}:${toBase64Url(iv)}:${toBase64Url(tag)}:${toBase64Url(ciphertext)}`;
}

export function decryptSecret(ciphertext: string, secretKey: string): string {
  const [version, ivB64, tagB64, dataB64] = ciphertext.split(':');
  if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('Unsupported ciphertext format');
  }

  const key = deriveKey32Bytes(secretKey);
  const iv = fromBase64Url(ivB64);
  const tag = fromBase64Url(tagB64);
  const data = fromBase64Url(dataB64);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

