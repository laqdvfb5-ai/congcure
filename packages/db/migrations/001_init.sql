CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'CUSTOMER' CHECK (role IN ('CUSTOMER', 'STAFF', 'ADMIN')),
  tier          TEXT NOT NULL DEFAULT 'MEMBER' CHECK (tier IN ('MEMBER', 'CTV', 'AGENT')),
  balance       BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  topup_code    TEXT GENERATED ALWAYS AS ('NAP' || id::text) STORED UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY, -- sha256(token)
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE api_keys (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  prefix       TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  parent_id  BIGINT REFERENCES categories(id),
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE suppliers (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  adapter     TEXT NOT NULL DEFAULT 'generic-rest',
  base_url    TEXT NOT NULL,
  api_key_enc TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id           BIGSERIAL PRIMARY KEY,
  category_id  BIGINT NOT NULL REFERENCES categories(id),
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  description  TEXT NOT NULL DEFAULT '',
  images       TEXT[] NOT NULL DEFAULT '{}',
  attributes   JSONB NOT NULL DEFAULT '{}',
  type         TEXT NOT NULL CHECK (type IN ('STOCK', 'UNIQUE', 'API')),
  price_member BIGINT NOT NULL CHECK (price_member >= 0),
  price_ctv    BIGINT NOT NULL CHECK (price_ctv >= 0),
  price_agent  BIGINT NOT NULL CHECK (price_agent >= 0),
  active       BOOLEAN NOT NULL DEFAULT true,
  supplier_id  BIGINT REFERENCES suppliers(id),
  supplier_sku TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (type <> 'API' OR (supplier_id IS NOT NULL AND supplier_sku IS NOT NULL))
);
CREATE INDEX products_category_idx ON products(category_id);

CREATE TABLE orders (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id),
  product_id      BIGINT NOT NULL REFERENCES products(id),
  quantity        INT NOT NULL CHECK (quantity > 0),
  unit_price      BIGINT NOT NULL,
  total           BIGINT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('PENDING', 'COMPLETED', 'REFUNDED')),
  source          TEXT NOT NULL CHECK (source IN ('WEB', 'API')),
  idempotency_key TEXT,
  supplier_ref    TEXT,
  error           TEXT,
  attempts        INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX orders_user_idx ON orders(user_id, id DESC);
CREATE INDEX orders_pending_idx ON orders(updated_at) WHERE status = 'PENDING';

CREATE TABLE stock_items (
  id         BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id),
  secret_enc TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'SOLD')),
  order_id   BIGINT REFERENCES orders(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sold_at    TIMESTAMPTZ
);
CREATE INDEX stock_items_available_idx ON stock_items(product_id, id) WHERE status = 'AVAILABLE';
CREATE INDEX stock_items_order_idx ON stock_items(order_id);

CREATE TABLE ledger_entries (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id),
  amount        BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('TOPUP', 'PURCHASE', 'REFUND', 'ADJUST')),
  ref_type      TEXT,
  ref_id        TEXT,
  note          TEXT,
  created_by    BIGINT REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ledger_user_idx ON ledger_entries(user_id, id DESC);

CREATE TABLE bank_transactions (
  id              BIGSERIAL PRIMARY KEY,
  provider        TEXT NOT NULL,
  provider_txn_id TEXT NOT NULL,
  amount          BIGINT NOT NULL,
  content         TEXT NOT NULL,
  raw_payload     JSONB NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('MATCHED', 'UNMATCHED', 'IGNORED')),
  user_id         BIGINT REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_txn_id)
);
