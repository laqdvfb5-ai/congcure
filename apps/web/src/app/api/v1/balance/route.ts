import { withApiUser } from '@/lib/api';

export const GET = withApiUser(async (user) => Response.json({ balance: user.balance, tier: user.tier }));
