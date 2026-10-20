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
  listProducts(): Promise<SupplierProduct[]>;
}

/** transient = worth retrying (network, timeout, 5xx, 429). */
export class SupplierError extends Error {
  readonly transient: boolean;

  constructor(message: string, transient: boolean) {
    super(message);
    this.name = 'SupplierError';
    this.transient = transient;
  }
}
