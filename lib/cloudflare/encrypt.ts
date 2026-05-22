/**
 * AES-256-GCM encryption for customer Cloudflare API tokens.
 * Key and validation are lazy — checked at call time, not module load time.
 * Generate key: openssl rand -hex 32
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  const hex = process.env.CF_TOKEN_ENCRYPTION_KEY;
  if (!hex) throw new Error('CF_TOKEN_ENCRYPTION_KEY must be set (openssl rand -hex 32)');
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) throw new Error('CF_TOKEN_ENCRYPTION_KEY must be a 32-byte (64 hex char) value');
  return key;
}

/**
 * Encrypt a plaintext Cloudflare token.
 * Returns a base64-encoded string: iv:authTag:ciphertext
 */
export function encryptToken(plaintext: string): string {
  const key        = getKey();
  const iv         = crypto.randomBytes(12);
  const cipher     = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag    = cipher.getAuthTag();

  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

/**
 * Decrypt a stored token back to plaintext.
 * Throws if the ciphertext has been tampered with.
 */
export function decryptToken(stored: string): string {
  const key = getKey();
  const [ivB64, authTagB64, ciphertextB64] = stored.split(':');

  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error('Invalid encrypted token format');
  }

  const iv         = Buffer.from(ivB64, 'base64');
  const authTag    = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
