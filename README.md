# Shop Product Entry

A mobile-first, installable web app (PWA) for a grocery shop. Employees scan a product barcode with the phone camera and add the product to a Supabase (Postgres) database. It is built to be fast: saves are optimistic, work offline, and lookups hit a local cache first. It is the first part of a larger POS, so the data layer is separated from the UI.

## 1. Supabase setup

1. Create a Supabase project (use a separate dev project for testing).
2. Open **SQL Editor**, paste all of `supabase/schema.sql`, and run it (re-run it on an existing project to upgrade: it makes barcodes optional). It creates the `products` and `profiles` tables, the duplicate-prevention indexes, and Row Level Security.
3. **Disable public sign-ups:** Authentication → Sign In / Providers → turn **off** "Allow new users to sign up". The app has no sign-up page.
4. **Add employees:** Authentication → Users → *Add user* → *Create new user*, with email and password, and tick *Auto Confirm User*. Give each employee their own account (the "added by" email comes from it).
5. **Make yourself the owner** (only the owner can edit/delete products and export CSV). Run in the SQL editor with your email:
   ```sql
   update public.profiles set role = 'owner'
   where id = (select id from auth.users where email = 'you@example.com');
   ```
   Sign out and in again in the app so the role is picked up.
6. **API keys:** Project Settings → API. Copy the **Project URL** and the **anon / publishable** key. Never use the `service_role` / secret key in this app.

## 2. Run locally

```bash
cp .env.example .env.local     # then fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

> **Quick phone test on the same Wi-Fi:** `npm run dev:https` (or `npm run dev:local:https`), then open the printed `https://192.168.x.x:5173` address on the phone and accept the one-time certificate warning (Advanced → Proceed). The camera then works.

> **The camera needs HTTPS.** `localhost` counts as secure on the computer, but a phone opening `http://192.168.x.x:5173` will not get the camera. Test on a phone through the deployed HTTPS site, or a tunnel such as `cloudflared tunnel --url http://localhost:5173`.

### Run with a local Supabase (no cloud project needed)

Needs Docker. Everything runs on your computer, and the schema is applied from `supabase/migrations/`.

```bash
npx supabase start            # first run downloads images; prints the local URL and keys
npm run dev:local             # app against the local database (reads .env.localdb.local)
npx supabase stop             # when finished
```

Create `.env.localdb.local` (it is git-ignored) with the local URL, the printed publishable key, and test users you create in Studio (http://127.0.0.1:54323 → Authentication) or with the local admin API:

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<publishable key printed by supabase start>
TEST_EMPLOYEE_EMAIL=...   TEST_EMPLOYEE_PASSWORD=...
TEST_OWNER_EMAIL=...      TEST_OWNER_PASSWORD=...
```
Make the owner an owner with the SQL from section 1, step 5 (Studio → SQL editor).

`supabase/schema.sql` (for pasting into the cloud SQL editor) and `supabase/migrations/*_init_schema.sql` (used locally) are the same file. If you change one, copy it to the other.

## 3. Tests

```bash
npm test                  # unit tests: queue, cache, repo, validation, helpers
npm run test:integration  # real database (the local one by default): duplicates, RLS, owner vs employee
```

The integration tests need a **dev project** with the schema applied and two test users (one employee, one owner). Put their credentials in `.env.local` (see `.env.example`: `TEST_EMPLOYEE_*`, `TEST_OWNER_*`). They insert rows prefixed `TEST-` and delete them afterwards. `npm run test:integration` reads `.env.localdb.local`, so it runs against the local database; to run against a cloud dev project, use `npx vitest run --config vitest.integration.config.ts` with `TEST_*` in `.env.local`.

## 4. Deploy (free)

Both options give you HTTPS, which the camera requires. Set the same two environment variables on either.

**Vercel**
- Import the repository. Framework preset: **Vite**.
- Build command: `npm run build`
- Output directory: `dist`
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

**Cloudflare Pages**
- Create a Pages project from the repository.
- Build command: `npm run build`
- Build output directory: `dist`
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

## 5. Install on a phone

- **Android (Chrome):** open the site → ⋮ menu → **Install app** (or *Add to Home screen*).
- **iPhone (Safari):** open the site → **Share** → **Add to Home Screen**.

The camera permission is requested the first time you sign in. If it was blocked, allow it in the browser's site settings.

## How it works

- **Scan:** point at a barcode; the same code must be read twice in a row, then the phone vibrates and beeps. USB/Bluetooth scanners that type like a keyboard also work (Enter ends the code), and there is a manual input field.
- **Existing product:** shows "Already in database" with who added it and when. It cannot be added again. The owner sees an **Edit** button.
- **Delete (owner only):** the product sheet has a **Delete** button with a confirmation. Employees never see it, and the database refuses their deletes.
- **No barcode:** the Scan tab has a **Product has no barcode** button that opens the same form without a barcode. Those products are found by name or company.
- **New product:** a bottom sheet with Name, Unit, Selling price and Company (autocompletes existing companies to avoid spelling variants).
- **Optimistic save:** pressing Save shows success and resets to scan immediately; the insert runs in the background.
- **Offline:** if there is no internet, the product is kept in IndexedDB and a **Pending sync (n)** badge appears. It retries automatically when back online. If someone else added the same barcode meanwhile, you get a notice and nothing is duplicated.
- **Duplicates:** the database refuses a repeated barcode, and also the same name + company + unit under a different barcode (case and spacing ignored).
- **Times** are shown in Asia/Dhaka.

## Adding Bengali later

Copy `src/lib/i18n/en.ts` to `bn.ts` with translated values, then select it in `src/lib/i18n/index.ts`. All UI text already goes through `t()`.

## Project layout

```
supabase/schema.sql         tables, indexes, RLS, triggers
src/lib/                    supabase client, i18n, formatting, validation, csv
src/data/                   productsApi (Supabase) · productCache + offlineQueue (IndexedDB)
                            productRepo (the only data API the UI uses) · autoSync
src/scanner/                useBarcodeScanner, detector (native or ZXing WASM), keyboard scanners
src/auth/                   session, login
src/features/               scan · products · account screens
```
