import type { Tier } from './types';

export type PriceFields = { priceMember: number; priceCtv: number; priceAgent: number };

export function priceForTier(p: PriceFields, tier: Tier): number {
  switch (tier) {
    case 'AGENT': return p.priceAgent;
    case 'CTV': return p.priceCtv;
    default: return p.priceMember;
  }
}
