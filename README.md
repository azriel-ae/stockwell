# Stockwell

**Know your stock. Stay in control.**

Stockwell is an inventory management application that uses **[Drivebase](https://drivebaseaz.vercel.app/) as its database backend and storage provider** — it is the first external application consuming Drivebase end-to-end: products, categories, suppliers, the stock movement ledger and even product images live behind the Drivebase API (Google Sheets / Google Drive underneath), not in any local or alternative database.

Built with Next.js (App Router) + TypeScript + Tailwind CSS + Recharts + Zod.

---

## Architecture

```
Browser ── Stockwell server (Next.js route handlers, server components)
              │   DRIVEBASE_API_KEY stays here — never sent to the browser
              ▼
         Drivebase REST API (/api/v1)
              │
              ▼
         Google Sheets (records) / Google Drive (files)
```

- **All business data** is stored in ONE Drivebase project, in one Drivebase database (`Stockwell`), as six tables: `products`, `categories`, `suppliers`, `stock_movements`, `app_settings`, `operations`.
- **Relasi** `products.category_id → categories`, `products.supplier_id → suppliers`, `stock_movements.product_id → products` are registered through the Drivebase Relationships API (metadata — Google Sheets has no native foreign keys) and drive the `?expand=` joins.
- **Product images** are uploaded through Drivebase Storage (`POST /api/v1/files`, multipart) and stored on the product record in a `file`-type column; the browser renders them through the server-side proxy `/api/assets/:fileId` so the API key is never exposed.
- The API contract used by the adapter was taken from the actual Drivebase implementation (`docs/API.md` + route handlers) — no invented endpoints.

## Feature overview

- **Dashboard** — total products, stock units, low/out-of-stock counts, inventory value, 14-day movement trend, category distribution, top stock; every number is computed from live Drivebase data (empty states when there is no data).
- **Products** — full CRUD, search, category/supplier/stock-status filters, sorting, pagination, unique SKU enforcement, opening-stock ledger entry, image upload/replace/delete, per-product movement history and ledger integrity check.
- **Categories** — CRUD with a guarded delete (refused while products still reference the category).
- **Suppliers** — CRUD with email validation, detail page with associated products, guarded delete.
- **Stock movements** — Stock In / Stock Out / Adjustment (adjustments require a reason), negative stock impossible, full audit trail (previous → resulting stock, reference number), pagination + filters, and a consistency protocol with reconciliation (below).
- **Reports** — date-range and category filters, in/out/adjustment totals, inventory by category, low-stock and out-of-stock watchlists, CSV exports (summary / products / movements) generated from live data.
- **Settings** — business name/description, currency (IDR default, Rupiah formatting), default unit, default low-stock threshold; stored in the Drivebase `app_settings` table.
- **Drivebase connection page** — a REAL round-trip test (never "connected" merely because env vars exist): project info, database/table availability, schema drift report, relationship registration status, storage availability, last successful check. One-click idempotent initialization.

## Stock consistency model (Drivebase has no ACID transactions)

Every movement is applied through a write-ahead protocol:

1. The client generates one `Idempotency-Key` per user action (retries reuse it).
2. A `pending` row is written to the `operations` table first (Drivebase's own `Idempotency-Key` header makes the network retry safe).
3. The ledger row is inserted in `stock_movements` (with `previous_stock` / `resulting_stock`).
4. The product's `stock_quantity` is patched to the absolute resulting value.
5. The operation is marked `applied` with the movement id.

Crashes leave a `pending` operation → **Reconcile pending** (movements page) completes or safely fails it; **Verify & repair** (product page) recomputes a product's stock from the ledger and repairs drift. Retries with the same key replay the stored result instead of double-applying. Residual risk (documented honestly): two serverless instances writing the same product concurrently can interleave; the ledger stays complete, and reconciliation repairs the product stock.

## Getting started

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev                  # http://localhost:3000
```

Environment variables (all **server-side only** — never use `NEXT_PUBLIC_`):

| Variable | Required | Purpose |
|---|---|---|
| `DRIVEBASE_API_BASE_URL` | yes | e.g. `https://drivebaseaz.vercel.app/api/v1` |
| `DRIVEBASE_API_KEY` | yes | a Drivebase API key (`db_live_…`) with read/write on your project |
| `DRIVEBASE_PROJECT_ID` | no | cross-check against the key's bound project (mismatch is reported) |
| `STOCKWELL_ACCESS_TOKEN` | recommended in production | unlocks the app with a password (HttpOnly cookie session) |

Then open **/connection** and click **Initialize tables** — this creates the `Stockwell` database, the six tables, the three relationships and the default settings rows inside your Drivebase project. It is idempotent: re-running never deletes tables or overwrites data; existing tables are only checked for schema drift and reported.

### Alternative: set up via the Drivebase SQL editor

`stockwell-setup.sql` (project root) creates the same six tables and seeds
the default settings through the Drivebase dashboard **SQL editor**
(PostgreSQL-flavored subset):

1. In the Drivebase dashboard, create/select the **Stockwell** database.
2. Open **SQL editor**, paste the whole file, run it (7 statements,
   idempotent `IF NOT EXISTS`; the file has been validated against
   Drivebase's actual SQL parser — columns and types match the app schema).
3. Still run Stockwell → /connection → **Initialize tables** once: it
   registers the three relationships (SQL cannot express them) without
   duplicating anything already created.

## Deploying to Vercel

1. Push this project to a Git repository and import it in Vercel (framework preset: **Next.js** — no custom build settings needed). A minimal `vercel.json` (`framework: "nextjs"`) is included; nothing else is needed — there is no middleware, no cron job and no build-time environment variables (the build runs clean with no env at all).
2. Add the environment variables above in **Project → Settings → Environment Variables** (Production + Preview). Generate the access token with `openssl rand -base64 24`.
3. Deploy. On first visit open `/connection` and run **Test connection** + **Initialize tables**.
4. Create the Drivebase API key beforehand: Drivebase dashboard → your project → **API keys** → create key (shown once — store it in Vercel env vars).

Deploy-readiness was verified from the shipped zip itself: fresh unzip → `npm ci` (127 packages) → `npm run build` with a scrubbed environment → `npm run start` + route checks, all green.

No localhost dependencies: the base URL points at your deployed Drivebase instance.

## Testing

```bash
npm test               # unit tests (mocked Drivebase HTTP layer)
npm run test:integration  # REAL Drivebase round-trips (opt-in)
```

**Local end-to-end without a Drivebase key** — a mock Drivebase server
(implements the same REST contract in-memory) ships in `scripts/`:

```bash
npm run mock:drivebase   # http://localhost:3222/api/v1, key: db_live_mockkey
DRIVEBASE_API_BASE_URL=http://localhost:3222/api/v1 \
DRIVEBASE_API_KEY=db_live_mockkey npm run dev
```

Integration tests are opt-in and never run in the default suite:

```bash
RUN_DRIVEBASE_INTEGRATION=1 \
DRIVEBASE_API_BASE_URL=https://drivebaseaz.vercel.app/api/v1 \
DRIVEBASE_API_KEY=db_live_YOUR_KEY \
npm run test:integration
```

They cover: connectivity, authentication (positive + negative), project access, idempotent table initialization, category CRUD, supplier + product CRUD, SKU uniqueness, search/filter, stock movement application + idempotent retry + insufficient-stock rejection, image upload/verify/delete through Drivebase Storage, invalid and unauthorized requests, Drivebase-unavailable behavior, data persistence on fresh reads, relationship registration and reconciliation safety. All created rows carry the `TEST-SW-` marker; the cleanup pass deletes **only** rows with that marker.

> Status in this sandbox: unit tests pass; integration tests were **not executed** here (no production API key available in the sandbox) — run them with your key as shown above.

## Security notes

- The Drivebase API key is only read in server modules and attached to outbound requests; it is never sent to the browser, never stored in `localStorage`, never printed to logs (the error translator strips request context).
- Frontend ↔ backend: all mutations go through Stockwell route handlers requiring a custom header (`x-stockwell-request`) — cross-site form posts cannot set it (CSRF guard). The optional access token uses an HttpOnly, SameSite=Lax cookie.
- Input validation with Zod on every route handler (prices, quantities, emails, SKU format, upload MIME/size + magic-byte sniffing) — validated again by Drivebase against the table schema.
- React escapes all rendered data (no `dangerouslySetInnerHTML` anywhere).
- Read caching (15 s TTL) keeps the app comfortably inside Drivebase's 120 requests/minute per-key rate limit.

## Project layout

```
src/
  app/(app)/…          dashboard, products (+[id]), categories, suppliers (+[id]),
                       movements, reports, settings, connection
  app/api/…            route handlers (the Stockwell backend)
  components/          UI kit, charts, feature views
  lib/drivebase/       Drivebase adapter: client, records, tables, storage,
                       relationships, errors, types, config
  lib/services/        products, categories, suppliers, stock-movements
                       (consistency protocol), reports, settings, init, connection
  lib/                 models, schema (expected tables), validation, stock, format, http
tests/unit/            mocked-HTTP unit tests
tests/integration/     real Drivebase integration suite (opt-in)
```

## Known limitations (honest)

- Google Sheets has no transactions; consistency relies on the write-ahead ledger + idempotency + reconciliation described above (cross-instance interleaving can occur on Vercel, and is repaired on demand).
- Drivebase reads fetch whole sheets; Stockwell caps reads at 1000 products / 1000 movements per aggregate and caches reads briefly. Very large catalogs (> a few thousand rows) will feel slow — that is a Drivebase platform limit, not a Stockwell one.
- Multipart uploads are not idempotent at the Drivebase level (documented); image replace cleans up best-effort.
- Table schemas are never auto-migrated: drift is detected and reported on the connection page with repair instructions.
