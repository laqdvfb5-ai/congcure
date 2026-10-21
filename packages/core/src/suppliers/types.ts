export interface SupplierOrderInput {
  ref: string;
  sku: string;
  quantity: number;
}

export type SupplierOrderResult =
  | { status: 'completed'; supplierRef: string; secrets: string[] }
  | { status: 'processing'; supplierRef: string };

export interface SupplierProduct {
  sku: string;
  name: string;
  price: number;
  stock: number | null;
}

export interface SupplierAdapter {
  placeOrder(input: SupplierOrderInput): Promise<SupplierOrderResult>;
  listProducts(opts?: { q?: string; signal?: AbortSignal }): Promise<SupplierProduct[]>;
  getProduct?(sku: string, opts?: { signal?: AbortSignal }): Promise<SupplierProduct | null>;
  getStock?(sku: string, opts?: { signal?: AbortSignal }): Promise<number | null>;
}

/** transient = worth retrying (network, timeout, 5xx, 429). */
export class SupplierError extends Error {
  readonly transient: boolean;

  constructor(message: string, transient: boolean, readonly code?: string) {
    super(message);
    this.name = 'SupplierError';
    this.transient = transient;
  }
}
