import { describe, expect, it } from 'vitest';
import {
  AppError, decryptSecret, encryptSecret, hashPassword, isAppError,
  randomToken, safeEqual, sha256, verifyPassword,
} from '../src/index';

describe('crypto', () => {
  it('round-trips secrets and uses a fresh IV each time', () => {
    const plain = 'user@mail.com|p@ss:word|2FA';
    const a = encryptSecret(plain);
    const b = encryptSecret(plain);
    expect(a).not.toBe(b);
    expect(a.startsWith('v1:')).toBe(true);
    expect(decryptSecret(a)).toBe(plain);
    expect(decryptSecret(encryptSecret(''))).toBe('');
  });

  it('rejects tampered ciphertext', () => {
    const parts = encryptSecret('hello').split(':');
    parts[3] = Buffer.from('HELLO').toString('base64');
    expect(() => decryptSecret(parts.join(':'))).toThrow();
  });

  it('hashes and verifies passwords', async () => {
    const h = await hashPassword('password123');
    expect(h.startsWith('scrypt:')).toBe(true);
    expect(await verifyPassword('password123', h)).toBe(true);
    expect(await verifyPassword('wrong', h)).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
  });

  it('has token helpers', () => {
    expect(sha256('a')).toHaveLength(64);
    expect(randomToken()).not.toBe(randomToken());
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
  });

  it('AppError maps codes to HTTP status', () => {
    const e = new AppError('INSUFFICIENT_BALANCE', 'Số dư không đủ');
    expect(e.status).toBe(402);
    expect(isAppError(e)).toBe(true);
    expect(isAppError(new Error('x'))).toBe(false);
  });
});
