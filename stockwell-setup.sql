-- ============================================================================
-- Stockwell — Drivebase setup script
-- "Know your stock. Stay in control."
--
-- HOW TO RUN (Drivebase dashboard):
--   1. Open your Drivebase instance (e.g. https://drivebaseaz.vercel.app).
--   2. Open the "Stockwell" database. If it does not exist yet, create it
--      first (Databases → New database → name: Stockwell).
--   3. Open the SQL editor (sidebar → SQL), select the "Stockwell"
--      database, paste this whole file and run it.
--
-- NOTES (Drivebase SQL subset):
--   - Statements run sequentially; a failed statement does not stop the
--     rest. This script is idempotent (IF NOT EXISTS) — safe to re-run.
--   - Foreign keys are not supported (data lives in Google Sheets), so
--     relationships are registered as metadata by the Stockwell app
--     (Drivebase connection page → "Initialize tables") or the dashboard
--     Relationships UI:
--       products.category_id      -> categories.__id
--       products.supplier_id      -> suppliers.__id
--       stock_movements.product_id -> products.__id
--   - Drivebase assigns record ids automatically (id, created_at,
--     updated_at exist on every table) — no SERIAL/UUID needed.
--   - products.image stores a Drivebase file id (image uploads go through
--     the Drivebase Storage API, not SQL).
--   - SKU uniqueness, stock consistency and referential checks are enforced
--     by the Stockwell application layer.
-- ============================================================================

-- 1. Product catalog
CREATE TABLE IF NOT EXISTS products (
  sku            TEXT NOT NULL,
  name           TEXT NOT NULL,
  description    TEXT,
  category_id    TEXT,
  supplier_id    TEXT,
  purchase_price NUMERIC,
  selling_price  NUMERIC,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  minimum_stock  INTEGER NOT NULL DEFAULT 0,
  unit           TEXT,
  image          TEXT
);

-- 2. Product categories
CREATE TABLE IF NOT EXISTS categories (
  name        TEXT NOT NULL,
  description TEXT
);

-- 3. Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  name           TEXT NOT NULL,
  contact_person TEXT,
  email          EMAIL,
  phone          TEXT,
  address        TEXT,
  notes          TEXT
);

-- 4. Stock movement ledger (the audit trail)
CREATE TABLE IF NOT EXISTS stock_movements (
  product_id       TEXT NOT NULL,
  movement_type    TEXT NOT NULL,
  quantity         INTEGER NOT NULL,
  previous_stock   INTEGER NOT NULL,
  resulting_stock  INTEGER NOT NULL,
  movement_date    DATE NOT NULL,
  notes            TEXT,
  reference_number TEXT,
  operation_key    TEXT
);

-- 5. Application settings (key/value)
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT NOT NULL,
  value TEXT NOT NULL
);

-- 6. Consistency bookkeeping (write-ahead operations for stock changes)
CREATE TABLE IF NOT EXISTS operations (
  operation_key TEXT NOT NULL,
  kind          TEXT NOT NULL,
  status        TEXT NOT NULL,
  product_id    TEXT,
  payload       JSON,
  result        JSON
);

-- 7. Default settings (only business_name/currency/default_unit/
--    low_stock_threshold; re-running never overwrites saved values)
INSERT INTO app_settings (key, value) VALUES
  ('business_name', 'Stockwell'),
  ('currency', 'IDR'),
  ('default_unit', 'pcs'),
  ('low_stock_threshold', '5');

-- Done. After this, open Stockwell → Drivebase connection →
-- "Initialize tables" to register the three relationships (it will not
-- duplicate anything created above) and "Test connection" to verify.
