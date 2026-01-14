import { createHash } from 'node:crypto';

export function deriveKey32Bytes(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

