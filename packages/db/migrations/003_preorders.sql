ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('PENDING', 'PREORDER', 'COMPLETED', 'REFUNDED'));
ALTER TABLE orders ADD COLUMN supplier_attempted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN fulfilled_by BIGINT REFERENCES users(id);
ALTER TABLE bank_payments ADD COLUMN preorder BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX orders_preorder_idx ON orders(updated_at, id) WHERE status = 'PREORDER';
