import { getPool } from '@web12/db';
import { getUser, registerUser, type Role, type Tier, type User } from '../src/index';

let seq = 0;

export async function makeUser(
  opts: { tier?: Tier; role?: Role; balance?: number; password?: string } = {},
): Promise<User> {
  seq++;
  const u = await registerUser({
    email: `user${seq}_${Date.now()}@test.local`,
    password: opts.password ?? 'password123',
    name: `User ${seq}`,
  });
  await getPool().query('UPDATE users SET tier = $2, role = $3, balance = $4 WHERE id = $1', [
    u.id, opts.tier ?? 'MEMBER', opts.role ?? 'CUSTOMER', opts.balance ?? 0,
  ]);
  return (await getUser(u.id))!;
}
