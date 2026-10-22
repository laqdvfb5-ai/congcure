ALTER TABLE orders ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'WALLET'
  CHECK (payment_method IN ('WALLET', 'BANK'));

CREATE TABLE bank_payments (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  user_id BIGINT NOT NULL REFERENCES users(id),
  product_id BIGINT NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  product_type TEXT NOT NULL CHECK (product_type IN ('STOCK', 'UNIQUE', 'API')),
  supplier_id BIGINT REFERENCES suppliers(id),
  supplier_sku TEXT,
  quantity INT NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  unit_price BIGINT NOT NULL CHECK (unit_price > 0),
  total BIGINT NOT NULL CHECK (total = unit_price * quantity AND total <= 100000000),
  received_amount BIGINT NOT NULL DEFAULT 0 CHECK (received_amount >= 0),
  credited_amount BIGINT NOT NULL DEFAULT 0 CHECK (credited_amount >= 0 AND credited_amount <= received_amount),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PAID', 'CREDITED', 'EXPIRED', 'CANCELLED')),
  order_id BIGINT UNIQUE REFERENCES orders(id),
  request_key TEXT NOT NULL,
  bank_id TEXT NOT NULL,
  bank_account TEXT NOT NULL,
  bank_account_name TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '15 minutes',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, request_key),
  CHECK ((status = 'PAID') = (order_id IS NOT NULL))
);
CREATE INDEX bank_payments_pending_idx ON bank_payments(expires_at) WHERE status = 'PENDING';
CREATE INDEX bank_payments_user_idx ON bank_payments(user_id, id DESC);
ALTER TABLE bank_transactions ADD COLUMN payment_id BIGINT REFERENCES bank_payments(id);
