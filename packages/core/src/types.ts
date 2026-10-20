export type Role = 'CUSTOMER' | 'STAFF' | 'ADMIN';
export type Tier = 'MEMBER' | 'CTV' | 'AGENT';

export const ROLES: Role[] = ['CUSTOMER', 'STAFF', 'ADMIN'];
export const TIERS: Tier[] = ['MEMBER', 'CTV', 'AGENT'];

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  tier: Tier;
  balance: number;
  topupCode: string;
  createdAt: Date;
}

export interface ApiKey {
  id: number;
  name: string;
  prefix: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}
