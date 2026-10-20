import { describe, expect, it } from 'vitest';
import {
  createApiKey, getSessionUser, getUserByApiKey, listApiKeys, login, logout,
  registerUser, revokeApiKey, setUserTier, getUser,
} from '../src/index';

describe('auth', () => {
  it('registers, logs in and resolves the session', async () => {
    const u = await registerUser({ email: ' An@Example.com ', password: 'password123', name: 'An' });
    expect(u.email).toBe('an@example.com');
    expect(u.role).toBe('CUSTOMER');
    expect(u.tier).toBe('MEMBER');
    expect(u.balance).toBe(0);
    expect(u.topupCode).toBe(`NAP${u.id}`);

    const { token, user } = await login('an@example.com', 'password123');
    expect(user.id).toBe(u.id);
    expect((await getSessionUser(token))?.id).toBe(u.id);

    await logout(token);
    expect(await getSessionUser(token)).toBeNull();
  });

  it('rejects duplicate email, weak password and bad credentials', async () => {
    await registerUser({ email: 'a@b.co', password: 'password123', name: 'A' });
    await expect(registerUser({ email: 'A@B.co', password: 'password123', name: 'A' }))
      .rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(registerUser({ email: 'x@b.co', password: 'short', name: 'X' }))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(registerUser({ email: 'not-an-email', password: 'password123', name: 'X' }))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(login('a@b.co', 'wrongpass')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(login('nobody@b.co', 'password123')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(await getSessionUser('random-token')).toBeNull();
  });

  it('creates, uses and revokes API keys', async () => {
    const u = await registerUser({ email: 'r@b.co', password: 'password123', name: 'R' });
    const { key, apiKey } = await createApiKey(u.id, 'bot');
    expect(key.startsWith('sk_')).toBe(true);
    expect(apiKey.prefix).toBe(key.slice(0, 10));

    expect((await getUserByApiKey(key))?.id).toBe(u.id);
    const [listed] = await listApiKeys(u.id);
    expect(listed?.lastUsedAt).not.toBeNull();

    await revokeApiKey(u.id, apiKey.id);
    expect(await getUserByApiKey(key)).toBeNull();
    await expect(revokeApiKey(u.id, apiKey.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await getUserByApiKey('sk_doesnotexist')).toBeNull();
  });

  it('changes tier', async () => {
    const u = await registerUser({ email: 't@b.co', password: 'password123', name: 'T' });
    await setUserTier(u.id, 'AGENT');
    expect((await getUser(u.id))?.tier).toBe('AGENT');
    await expect(setUserTier(u.id, 'BOSS' as never)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
