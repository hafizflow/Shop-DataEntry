# Shop Product Entry: Design Spec

Date: 2026-10-04

## Goal
Mobile-first installable PWA. Grocery-shop employees scan a product barcode with the phone camera and add the product to Supabase (Postgres). First module of a larger POS, so the code stays clean and extensible. Employees must never feel waiting.

## Stack
Vite, React, TypeScript, Tailwind, `@supabase/supabase-js`, `barcode-detector` (native BarcodeDetector, ZXing WASM fallback; no html5-qrcode), `vite-plugin-pwa`. Deploys free on Vercel or Cloudflare Pages.

## Decisions (agreed)
- Owner role: `profiles` table (`role` in owner/employee). `app_metadata.role = 'owner'` also accepted.
- Scan flow: **wait for the lookup** (cache first, then Supabase). If offline and not in cache, open the form and queue the save; conflicts resolve at sync.
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (the "publishable" key works). Real values only in gitignored `.env.local`; `.env.example` committed.
- Tests: Vitest + `fake-indexeddb` for the queue and error mapping; an integration script against the real dev project (anon denied, duplicates, owner vs employee RLS) that cleans up `__test__` rows. Test users are supplied later via `.env.local` (`TEST_EMPLOYEE_*`, `TEST_OWNER_*`); the user runs `schema.sql` themselves.
- i18n: plain `en.ts` dictionary + `t()`; Bengali can be added later.
- Not a git repo currently; no commit step.

## Structure
```
src/
  lib/        supabase.ts, env.ts, format.ts (Asia/Dhaka time, price), i18n/{en.ts,index.ts}
  data/       productsApi.ts   Supabase calls + error mapping
              productCache.ts  IndexedDB: products + companies, delta sync by updated_at
              offlineQueue.ts  IndexedDB: pending inserts, flush, change events
              productRepo.ts   the single facade the UI uses (lookup, save, list, search)
  auth/       AuthProvider, useAuth (session, isOwner), LoginScreen
  scanner/    useBarcodeScanner.ts, ScannerView.tsx, feedback.ts (beep/vibrate), camera helpers
  features/   scan/ (ScanScreen, ProductSheet, ExistingProductCard, ManualEntry)
              products/ (ProductList, ProductDetailSheet)
              account/ (AccountScreen, csv.ts)
  components/ BottomSheet, TabBar, Toast, PendingBadge
supabase/schema.sql
```
`productRepo` is the extensibility seam: the UI never touches Supabase or IndexedDB directly; later POS modules add their own repos beside it.

## Scanner
- `getUserMedia` rear camera, 1280x720 ideal; continuous `requestAnimationFrame` loop that skips frames while a detect call is in flight.
- Formats: ean_13, ean_8, upc_a, upc_e, code_128, code_39.
- A code must be read 2 times in a row; then vibrate, beep, pause scanning.
- Overlay framing guide, torch toggle, tap-to-focus, camera switch (each only where supported).
- `useBarcodeScanner({videoRef, formats, onDetect})` returns `{torch, switchCamera, focus, pause, resume}`.
- `barcode-detector` and WASM are dynamically imported only on the Scan screen. Camera permission is preloaded after login so the camera starts as the app opens.
- Fallbacks: manual barcode input; USB/Bluetooth keyboard scanners (global key buffer, Enter ends the code, ignored while typing in a form field).

## Save flow (optimistic)
1. Validate the form. 2. Write the product to the local cache flagged pending. 3. Show success, bump "Added today", reset to scanning. 4. Insert in the background. 5. On network failure, persist to the IndexedDB queue and show "Pending sync (n)". 6. Flush on `online`, on app focus, and every 30 s.

Sync conflicts: duplicate barcode (23505) means it exists, so drop the item with a notice; duplicate name+company+unit drops the item with a "same product under another barcode" notice; permission or validation errors move the item to "Needs attention" (no endless retry), listed on Account.

## Lookup results
- Exists: card with "Already in database", added by (email) and when; adding is blocked; owner sees Edit.
- New: bottom sheet with barcode (read-only), Name (autofocus), Unit dropdown, Selling price (`inputMode="decimal"`), Company (autocomplete from existing companies).

## Screens
Bottom tabs: Scan (home, "Added today" counter), Products (search by name, barcode, company; infinite scroll; detail sheet; created time in Asia/Dhaka e.g. "4 Oct 2026, 1:49 AM"; added by), Account (login/logout, pending count and attention items, owner-only Export CSV). Login: email + password, persisted session, no sign-up page.

## Database (`supabase/schema.sql`)
- `products`: as specified (uuid id, barcode UNIQUE trimmed, name, unit with check for pcs/kg/g/litre/ml/dozen/pack/box, `selling_price numeric(12,2) >= 0`, company, `created_at`, `created_by default auth.uid()`, `updated_at` via trigger).
- Unique index on `(lower(trim(name)), lower(trim(company)), lower(unit))`; name search index.
- Trim trigger for barcode, name, company.
- `profiles(id, role default 'employee')`, auto-created by a trigger on `auth.users`; `is_owner()` is `security definer` with a fixed `search_path`.
- RLS on: authenticated SELECT and INSERT (`created_by = auth.uid()`); UPDATE and DELETE only when `is_owner()`; anon none. `profiles` readable by the owner of the row only, with no client writes.
- View `products_with_author` exposes `added_by_email`.
- Comments explain how to make an account the owner.

## Error mapping (`productsApi`)
23505 barcode: Already in database. 23505 name index: same product under another barcode. 23514: validation. 42501: no permission. Network failure: queue. Other: generic message with retry.

## PWA and UX
Autoupdate service worker, app-shell precache, Supabase calls never cached by the SW. Green accent, neutral background, dark mode follows system, 48px touch targets, safe-area insets, bottom sheets, accessible labels and focus states. Camera needs HTTPS.

## Deliverables
App code, `supabase/schema.sql`, `.env.example`, README (Supabase setup: run schema, disable public sign-ups, add employees, make yourself owner; local run; Vercel/Cloudflare Pages deploy; installing the PWA on Android/iPhone), tests, a passing `tsc` and build.
