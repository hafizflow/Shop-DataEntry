# Shop Product Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an installable mobile-first PWA where grocery-shop employees scan barcodes and add products to Supabase, with optimistic saves, an offline queue and a local cache.

**Architecture:** React UI talks only to a `productRepo` facade. The facade composes `productsApi` (Supabase), `productCache` (IndexedDB) and `offlineQueue` (IndexedDB). Saves write to the cache and queue first, then flush in the background. The scanner is a hook that lazy-loads `barcode-detector` (native API, ZXing WASM fallback).

**Tech Stack:** Vite, React 18, TypeScript (strict), Tailwind v4, `@supabase/supabase-js`, `barcode-detector`, `idb`, `vite-plugin-pwa`, Vitest + `fake-indexeddb`.

**Spec:** `docs/superpowers/specs/2026-10-04-shop-product-entry-design.md`

## Global Constraints

- Working directory `/Users/hafiz/Dev/Kajol-DataEntry`; it is NOT a git repo, so there are no commit steps. Each task ends with a checkpoint command instead.
- Env vars exactly `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Real values only in gitignored `.env.local`; `.env.example` has empty values.
- Never use `html5-qrcode`. Scanner formats exactly: `ean_13, ean_8, upc_a, upc_e, code_128, code_39`.
- Units exactly: `pcs, kg, g, litre, ml, dozen, pack, box`.
- Times are shown in `Asia/Dhaka`, format like `4 Oct 2026, 1:49 AM`.
- Touch targets >= 48px; bottom sheets, not modals; safe-area insets; dark mode follows system; green accent.
- All user-visible strings go through `t()` from `src/lib/i18n` (English only now).
- The UI never imports `supabase`, `idb`, or `productsApi` directly; only `productRepo` (and `auth/`).
- `barcode-detector` and its WASM load only via dynamic import from `src/scanner/detector.ts`.
- The service worker must never cache Supabase requests.
- Finish only when `npx tsc --noEmit`, `npm test` and `npm run build` pass.

## Review Focus

- **UPC-A vs EAN-13:** the same product can scan as `036000291452` or `0036000291452`. Lookup must find it either way (Task 3 `barcodeVariants`, Task 7 test).
- **Price typing:** `12,50`, `12.505`, `-1`, `abc`, empty, `1e3` and huge values must be rejected or normalized, never saved wrongly (Task 3 tests).
- **Double tap on Save / same barcode scanned twice quickly:** only one queue item and one insert (Task 6 and 7 tests).
- **Session expired while offline items are queued:** flush must pause and keep items pending, not mark them failed or drop them (Task 6 test).
- **Dhaka day boundary:** a product added at 23:30 UTC is "tomorrow" in Dhaka; "Added today" and displayed times must use Dhaka (Task 3 and 7 tests).

---

## File Structure

```
package.json  tsconfig.json  vite.config.ts  vitest.integration.config.ts  index.html
.env.example  .gitignore  pwa-assets.config.ts  public/icon.svg
supabase/schema.sql
tests/setup.ts  tests/integration/rls.test.ts
src/main.tsx  src/App.tsx  src/index.css  src/vite-env.d.ts
src/lib/{env,supabase,emitter,format,barcode,validate,csv}.ts   (+ *.test.ts)
src/lib/i18n/{en,index}.ts
src/data/{types,errors,db,productsApi,productCache,offlineQueue,productRepo,autoSync}.ts (+ tests)
src/auth/{AuthProvider.tsx,LoginScreen.tsx}
src/scanner/{detector,feedback,keyBuffer,useBarcodeScanner,useKeyboardScanner}.ts(x) (+ keyBuffer test)
src/components/{BottomSheet,TabBar,Toast,PendingBadge,ProductDetails}.tsx
src/features/shared/hooks.ts
src/features/scan/{ScanScreen,ScannerView,ManualEntry,ProductSheet}.tsx
src/features/products/ProductsScreen.tsx
src/features/account/AccountScreen.tsx
README.md
```

---

### Task 1: Project scaffold and tooling

**Files:** Create all root config files, `src/main.tsx`, `src/App.tsx` (placeholder), `src/index.css`, `src/vite-env.d.ts`, `tests/setup.ts`, `.gitignore`, `.env.example`, `.env.local`.

**Interfaces:**
- Produces: `npm run dev|build|test|test:integration|typecheck`, Tailwind classes `.btn .btn-primary .btn-secondary .input .card` and color tokens `bg-bg bg-surface text-fg text-muted border-line bg-accent text-accent-fg text-danger`.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "shop-product-entry",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview --host",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "icons": "pwa-assets-generator"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm i react react-dom @supabase/supabase-js barcode-detector idb
npm i -D vite @vitejs/plugin-react typescript tailwindcss @tailwindcss/vite vite-plugin-pwa @vite-pwa/assets-generator vitest jsdom fake-indexeddb @types/react @types/react-dom
```
Expected: installs without errors.

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["vite/client", "vite-plugin-pwa/client"]
  },
  "include": ["src", "tests", "vite.config.ts", "vitest.integration.config.ts", "pwa-assets.config.ts"]
}
```

- [ ] **Step 4: Write `vite.config.ts` (PWA added in Task 12)**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Write `tests/setup.ts`, `src/vite-env.d.ts`**

```ts
// tests/setup.ts
import 'fake-indexeddb/auto';
```
```ts
// src/vite-env.d.ts
/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}
```

- [ ] **Step 6: Write `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#15803d" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <link rel="icon" href="/icon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />
    <title>Shop Product Entry</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Write `src/index.css`**

```css
@import "tailwindcss";

:root {
  --bg: #f6f7f6; --surface: #ffffff; --text: #111827; --muted: #5b6472;
  --border: #e2e5e2; --accent: #15803d; --accent-contrast: #ffffff; --danger: #b91c1c;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1110; --surface: #171c1a; --text: #f1f5f2; --muted: #a3ada6;
    --border: #2a322e; --accent: #22c55e; --accent-contrast: #04210f; --danger: #f87171;
  }
}
@theme inline {
  --color-bg: var(--bg); --color-surface: var(--surface); --color-fg: var(--text);
  --color-muted: var(--muted); --color-line: var(--border); --color-accent: var(--accent);
  --color-accent-fg: var(--accent-contrast); --color-danger: var(--danger);
}
html, body, #root { height: 100%; }
body {
  background: var(--bg); color: var(--text); overscroll-behavior: none;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Bengali", sans-serif;
  -webkit-tap-highlight-color: transparent;
}
.btn { @apply inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50; }
.btn-primary { @apply bg-accent text-accent-fg; }
.btn-secondary { @apply border border-line bg-surface text-fg; }
.input { @apply min-h-12 w-full rounded-2xl border border-line bg-surface px-4 text-base text-fg placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent; }
.card { @apply rounded-3xl border border-line bg-surface p-4; }
@keyframes sheet-up { from { transform: translateY(100%); } to { transform: none; } }
.sheet-enter { animation: sheet-up 180ms ease-out; }
@media (prefers-reduced-motion: reduce) { .sheet-enter { animation: none; } }
```

- [ ] **Step 8: Write placeholders, env and ignore files**

`src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```
`src/App.tsx`: `export default function App() { return <div className="p-4">Shop Product Entry</div>; }`

`.gitignore`:
```
node_modules
dist
.env
.env.local
*.local
dev-dist
```
`.env.example`:
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
# Only for `npm run test:integration` (use a dev project and test users):
TEST_EMPLOYEE_EMAIL=
TEST_EMPLOYEE_PASSWORD=
TEST_OWNER_EMAIL=
TEST_OWNER_PASSWORD=
```
`.env.local` (real project values the user supplied; test users are added later by the user):
```
VITE_SUPABASE_URL=https://tmucmdhindynyzivacls.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_MvJbw7xcmL-CxpB-p9k5uA_EU5Ibpjy
```

- [ ] **Step 9: Checkpoint**

Run: `npm run build`
Expected: PASS (type-check and build succeed). Run `npm run dev`, open the printed URL, confirm the text renders and a green/neutral page loads, then stop the server.

---

### Task 2: Database schema and integration test

**Files:**
- Create: `supabase/schema.sql`, `vitest.integration.config.ts`, `tests/integration/rls.test.ts`

**Interfaces:**
- Produces: tables `products`, `profiles`; view `products_with_author` (all product columns + `added_by_email`); function `is_owner()`; constraint name `products_barcode_key`; index name `products_name_company_unit_key`. Task 4 maps errors by these two names.

- [ ] **Step 1: Write `supabase/schema.sql`**

```sql
-- Shop Product Entry schema. Run once in the Supabase SQL editor.
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE where possible.

-- ---------- profiles (roles) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'employee' check (role in ('owner', 'employee')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users that already existed before this script ran:
insert into public.profiles (id) select id from auth.users on conflict do nothing;

-- Owner = profiles.role 'owner' OR app_metadata.role 'owner' in the JWT.
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'owner', false)
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner');
$$;
revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

-- ---------- products ----------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  barcode text not null,
  name text not null,
  unit text not null,
  selling_price numeric(12,2) not null,
  company text not null,
  created_at timestamptz not null default now(),   -- when the product was added
  created_by uuid default auth.uid() references auth.users(id),
  updated_at timestamptz default now(),
  constraint products_barcode_key unique (barcode),
  constraint products_barcode_not_blank check (length(barcode) > 0),
  constraint products_name_not_blank check (length(name) > 0),
  constraint products_company_not_blank check (length(company) > 0),
  constraint products_unit_check check (unit in ('pcs','kg','g','litre','ml','dozen','pack','box')),
  constraint products_price_check check (selling_price >= 0)
);

-- Trim text, keep updated_at current.
create or replace function public.products_before_write() returns trigger
language plpgsql as $$
begin
  new.barcode := btrim(new.barcode);
  new.name := btrim(new.name);
  new.company := btrim(new.company);
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  return new;
end $$;

drop trigger if exists products_before_write on public.products;
create trigger products_before_write before insert or update on public.products
  for each row execute function public.products_before_write();

-- Same product (name + company + unit) cannot be entered under a different barcode.
create unique index if not exists products_name_company_unit_key
  on public.products (lower(btrim(name)), lower(btrim(company)), lower(unit));

-- Fast search on name (substring) and delta sync.
create extension if not exists pg_trgm with schema extensions;
create index if not exists products_name_trgm_idx
  on public.products using gin (lower(name) extensions.gin_trgm_ops);
create index if not exists products_updated_at_idx on public.products (updated_at);

-- ---------- RLS ----------
alter table public.products enable row level security;
alter table public.profiles enable row level security;

revoke all on public.products from anon;
revoke all on public.profiles from anon;
grant select, insert, update, delete on public.products to authenticated;
grant select on public.profiles to authenticated;

drop policy if exists products_select on public.products;
create policy products_select on public.products for select to authenticated using (true);

drop policy if exists products_insert on public.products;
create policy products_insert on public.products for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists products_update on public.products;
create policy products_update on public.products for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists products_delete on public.products;
create policy products_delete on public.products for delete to authenticated
  using (public.is_owner());

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = auth.uid());
-- No insert/update/delete policies on profiles: clients can never change roles.

-- ---------- "added by" view ----------
-- Runs with the view owner's rights so it can read auth.users, but is only granted to
-- signed-in users and exposes just the email. (Supabase may show a "security definer view"
-- advisory for this; it is intentional.)
create or replace view public.products_with_author as
  select p.*, u.email::text as added_by_email
  from public.products p
  left join auth.users u on u.id = p.created_by;
revoke all on public.products_with_author from public, anon;
grant select on public.products_with_author to authenticated;

-- ---------- HOW TO MAKE YOURSELF THE OWNER ----------
-- 1. Create your user in Authentication -> Users (or sign in once).
-- 2. Run this, with your email:
--
--    update public.profiles set role = 'owner'
--    where id = (select id from auth.users where email = 'you@example.com');
--
-- (Alternative: set {"role": "owner"} in the user's app_metadata. Never user_metadata.)
-- To demote: set role = 'employee'.
```

- [ ] **Step 2: Write `vitest.integration.config.ts`**

```ts
import { defineConfig, loadEnv } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    env: loadEnv(mode, process.cwd(), ''),
    testTimeout: 20000,
  },
}));
```

- [ ] **Step 3: Write `tests/integration/rls.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const env = process.env;
const ready = Boolean(
  env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY &&
  env.TEST_EMPLOYEE_EMAIL && env.TEST_EMPLOYEE_PASSWORD &&
  env.TEST_OWNER_EMAIL && env.TEST_OWNER_PASSWORD,
);

const run = Math.random().toString(36).slice(2, 8);
const base = (n: string) => ({ barcode: `TEST-${run}-${n}`, name: `TEST Rice ${run}`, unit: 'kg', selling_price: 10, company: `TEST Co ${run}` });

function client() {
  return createClient(env.VITE_SUPABASE_URL!, env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
}
async function signedIn(email: string, password: string) {
  const c = client();
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}

describe.skipIf(!ready)('products RLS and constraints (real Supabase project)', () => {
  let employee: SupabaseClient;
  let owner: SupabaseClient;
  let employeeId: string;

  beforeAll(async () => {
    employee = await signedIn(env.TEST_EMPLOYEE_EMAIL!, env.TEST_EMPLOYEE_PASSWORD!);
    owner = await signedIn(env.TEST_OWNER_EMAIL!, env.TEST_OWNER_PASSWORD!);
    employeeId = (await employee.auth.getUser()).data.user!.id;
  });

  afterAll(async () => {
    if (owner) await owner.from('products').delete().like('barcode', `TEST-${run}-%`);
  });

  it('denies anonymous access', async () => {
    const { data, error } = await client().from('products').select('id').limit(1);
    expect(error !== null || (data ?? []).length === 0).toBe(true);
    const ins = await client().from('products').insert(base('anon'));
    expect(ins.error).not.toBeNull();
  });

  it('lets an employee insert and read, with created_by set to them', async () => {
    const { data, error } = await employee.from('products').insert(base('a')).select().single();
    expect(error).toBeNull();
    expect(data!.created_by).toBe(employeeId);
    const view = await employee.from('products_with_author').select('added_by_email').eq('barcode', base('a').barcode).single();
    expect(view.data!.added_by_email).toBe(env.TEST_EMPLOYEE_EMAIL);
  });

  it('rejects a duplicate barcode, including whitespace variants', async () => {
    const dup = { ...base('a'), name: 'TEST other', company: 'TEST other co' };
    const r1 = await employee.from('products').insert(dup);
    expect(r1.error?.code).toBe('23505');
    expect(r1.error?.message).toContain('products_barcode_key');
    const r2 = await employee.from('products').insert({ ...dup, barcode: `  ${dup.barcode}  ` });
    expect(r2.error?.code).toBe('23505');
  });

  it('rejects same name+company+unit under another barcode (case/space-insensitive)', async () => {
    const r = await employee.from('products').insert({
      ...base('b'), name: `  ${base('b').name.toUpperCase()} `, company: base('b').company.toLowerCase(), unit: 'kg',
    });
    expect(r.error?.code).toBe('23505');
    expect(r.error?.message).toContain('products_name_company_unit_key');
  });

  it('allows same name+company with a different unit', async () => {
    const r = await employee.from('products').insert({ ...base('c'), unit: 'g' });
    expect(r.error).toBeNull();
  });

  it('rejects a negative price and a bad unit', async () => {
    const neg = await employee.from('products').insert({ ...base('d'), name: 'TEST neg', selling_price: -1 });
    expect(neg.error?.code).toBe('23514');
    const unit = await employee.from('products').insert({ ...base('e'), name: 'TEST unit', unit: 'tonne' });
    expect(unit.error?.code).toBe('23514');
  });

  it('rejects a forged created_by', async () => {
    const r = await employee.from('products').insert({ ...base('f'), name: 'TEST forged', created_by: '00000000-0000-0000-0000-000000000000' });
    expect(r.error).not.toBeNull();
  });

  it('stops an employee from updating or deleting', async () => {
    const u = await employee.from('products').update({ name: 'TEST hacked' }).eq('barcode', base('a').barcode).select();
    expect(u.data ?? []).toHaveLength(0);
    const d = await employee.from('products').delete().eq('barcode', base('a').barcode).select();
    expect(d.data ?? []).toHaveLength(0);
    const still = await owner.from('products').select('name').eq('barcode', base('a').barcode).single();
    expect(still.data!.name).toBe(base('a').name);
  });

  it('lets the owner update (updated_at moves) and delete', async () => {
    const before = await owner.from('products').select('updated_at').eq('barcode', base('a').barcode).single();
    const u = await owner.from('products').update({ selling_price: 11 }).eq('barcode', base('a').barcode).select().single();
    expect(u.error).toBeNull();
    expect(u.data!.selling_price).toBe(11);
    expect(new Date(u.data!.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(before.data!.updated_at).getTime());
    const d = await owner.from('products').delete().eq('barcode', base('a').barcode).select();
    expect(d.data).toHaveLength(1);
  });

  it('does not let an employee change their own role', async () => {
    const r = await employee.from('profiles').update({ role: 'owner' }).eq('id', employeeId).select();
    expect(r.data ?? []).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Run it (skips without test users)**

Run: `npm run test:integration`
Expected: the suite reports as skipped (no test credentials yet). It is run for real in Task 13 once the user supplies test users and applies the schema.

---

### Task 3: Pure helpers (types, i18n, format, barcode, validate, csv)

**Files:**
- Create: `src/data/types.ts`, `src/lib/i18n/{en,index}.ts`, `src/lib/{emitter,format,barcode,validate,csv}.ts`
- Test: `src/lib/{format,barcode,validate,csv}.test.ts`

**Interfaces:**
- Produces (used by all later tasks):
  - `UNITS`, `Unit`, `NewProduct`, `Product`, `QueueItem`, `ApiErrorKind` (in `data/types.ts`)
  - `t(key: MessageKey, vars?: Record<string, string|number>): string`, `MessageKey`
  - `createEmitter<T = void>(): { on(fn:(v:T)=>void): () => void; emit(v:T): void }`
  - `formatDhaka(iso: string): string`, `dhakaDayKey(d: Date | string): string`, `formatPrice(n: number): string`
  - `normalizeBarcode(s: string): string`, `barcodeVariants(code: string): string[]`
  - `parsePrice(s: string): number | null`
  - `validateForm(i: FormInput): {ok:true; value: NewProduct} | {ok:false; errors: FieldErrors}`
  - `buildCsv(products: Product[]): string`

- [ ] **Step 1: Write `src/data/types.ts`**

```ts
export const UNITS = ['pcs', 'kg', 'g', 'litre', 'ml', 'dozen', 'pack', 'box'] as const;
export type Unit = (typeof UNITS)[number];

export interface NewProduct {
  barcode: string;
  name: string;
  unit: Unit;
  selling_price: number;
  company: string;
}

export interface Product extends NewProduct {
  id: string;
  created_at: string;
  created_by: string | null;
  updated_at: string | null;
  added_by_email: string | null;
  /** true while only stored locally (queued, not yet confirmed by the server) */
  pending?: boolean;
}

export interface QueueItem {
  id: string; // client-generated product id, sent on insert so retries are idempotent
  product: NewProduct;
  authorEmail: string | null;
  status: 'pending' | 'attention';
  attempts: number;
  error?: string;
  createdAt: number;
}

export type ApiErrorKind =
  | 'network' | 'auth' | 'duplicate_barcode' | 'duplicate_product'
  | 'validation' | 'permission' | 'unknown';
```

- [ ] **Step 2: Write `src/lib/i18n/en.ts` and `index.ts`**

```ts
// src/lib/i18n/en.ts  (add a bn.ts with the same keys later)
export const en = {
  'app.name': 'Shop Product Entry',
  'config.missing': 'App is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  'tab.scan': 'Scan', 'tab.products': 'Products', 'tab.account': 'Account',
  'login.title': 'Sign in', 'login.email': 'Email', 'login.password': 'Password',
  'login.submit': 'Sign in', 'login.busy': 'Signing in…',
  'login.failed': 'Wrong email or password.', 'login.hint': 'Ask the shop owner for an account.',
  'scan.addedToday': 'Added today: {n}',
  'scan.hint': 'Point the camera at a barcode',
  'scan.manual.label': 'Type or scan a barcode', 'scan.manual.submit': 'Look up',
  'scan.torch': 'Flashlight', 'scan.switch': 'Switch camera', 'scan.retryCamera': 'Try camera again',
  'scan.camera.denied': 'Camera access is blocked. Allow the camera in your browser settings, or type the barcode below.',
  'scan.camera.error': 'Could not start the camera. You can type the barcode below.',
  'scan.looking': 'Looking up {code}…',
  'scan.offlineNew': 'No internet. This will sync when you are back online.',
  'product.already': 'Already in database',
  'product.addedBy': 'Added by {who} · {when}',
  'product.unknownUser': 'unknown',
  'product.syncing': 'Saved on this phone, syncing…',
  'product.edit': 'Edit', 'product.close': 'Close', 'product.barcode': 'Barcode',
  'form.new.title': 'New product', 'form.edit.title': 'Edit product',
  'form.barcode': 'Barcode', 'form.name': 'Name', 'form.unit': 'Unit',
  'form.price': 'Selling price', 'form.company': 'Company',
  'form.save': 'Save', 'form.saving': 'Saving…', 'form.cancel': 'Cancel',
  'unit.pcs': 'Pieces (pcs)', 'unit.kg': 'Kilogram (kg)', 'unit.g': 'Gram (g)',
  'unit.litre': 'Litre', 'unit.ml': 'Millilitre (ml)', 'unit.dozen': 'Dozen',
  'unit.pack': 'Pack', 'unit.box': 'Box',
  'err.barcode.required': 'Barcode is required.', 'err.name.required': 'Enter the product name.',
  'err.unit.invalid': 'Choose a unit.', 'err.price.invalid': 'Enter a valid price, like 45 or 45.50.',
  'err.company.required': 'Enter the company.',
  'err.duplicateBarcode': 'This barcode is already in the database.',
  'err.duplicateProduct': 'This product (same name, company and unit) already exists under another barcode.',
  'err.validation': 'Some values are not valid. Please check the form.',
  'err.permission': 'You do not have permission to do that.',
  'err.network': 'No internet connection.',
  'err.auth': 'Your session expired. Please sign in again.',
  'err.unknown': 'Something went wrong. Please try again.',
  'save.success': 'Saved {name}',
  'save.queuedDuplicate': 'This barcode is already waiting to sync.',
  'notice.conflictBarcode': '{barcode} was already added by someone else.',
  'notice.conflictProduct': '{name} already exists under another barcode and was not added.',
  'products.title': 'Products', 'products.search': 'Search name, barcode or company',
  'products.empty': 'No products found.', 'products.count': '{n} products',
  'account.title': 'Account', 'account.signedInAs': 'Signed in as {email}',
  'account.role.owner': 'Owner', 'account.role.employee': 'Employee',
  'account.pending': 'Pending sync ({n})', 'account.allSynced': 'Everything is synced',
  'account.syncNow': 'Sync now', 'account.signOut': 'Sign out',
  'account.signOutBlocked': 'Sync the pending items before signing out.',
  'account.export': 'Export CSV', 'account.exporting': 'Exporting…',
  'account.attention': 'Needs attention', 'account.retry': 'Retry', 'account.discard': 'Discard',
  'badge.pending': 'Pending sync ({n})',
} as const;
export type MessageKey = keyof typeof en;
```
```ts
// src/lib/i18n/index.ts
import { en, type MessageKey } from './en';
export type { MessageKey };

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const text: string = en[key];
  return vars ? text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')) : text;
}
```

- [ ] **Step 3: Write failing tests for format, barcode, validate, csv**

```ts
// src/lib/format.test.ts
import { describe, expect, it } from 'vitest';
import { dhakaDayKey, formatDhaka, formatPrice } from './format';

describe('format', () => {
  it('formats in Asia/Dhaka', () => {
    expect(formatDhaka('2026-10-03T19:49:00Z')).toBe('4 Oct 2026, 1:49 AM');
    expect(formatDhaka('2026-10-04T08:05:00Z')).toBe('4 Oct 2026, 2:05 PM');
  });
  it('uses the Dhaka calendar day, not UTC (day boundary)', () => {
    expect(dhakaDayKey('2026-10-03T23:30:00Z')).toBe('2026-10-04');
    expect(dhakaDayKey('2026-10-03T17:59:00Z')).toBe('2026-10-03');
  });
  it('formats price with 2 decimals', () => {
    expect(formatPrice(45)).toBe('45.00');
    expect(formatPrice(1234.5)).toBe('1,234.50');
  });
});
```
```ts
// src/lib/barcode.test.ts
import { describe, expect, it } from 'vitest';
import { barcodeVariants, normalizeBarcode } from './barcode';

describe('barcode', () => {
  it('trims', () => expect(normalizeBarcode('  890123 \n')).toBe('890123'));
  it('offers EAN-13 form for a UPC-A code and vice versa', () => {
    expect(barcodeVariants('036000291452')).toEqual(['036000291452', '0036000291452']);
    expect(barcodeVariants('0036000291452')).toEqual(['0036000291452', '036000291452']);
  });
  it('has no variants for other codes', () => {
    expect(barcodeVariants('8901234567890')).toEqual(['8901234567890']);
    expect(barcodeVariants('ABC-123')).toEqual(['ABC-123']);
  });
});
```
```ts
// src/lib/validate.test.ts
import { describe, expect, it } from 'vitest';
import { parsePrice, validateForm } from './validate';

describe('parsePrice', () => {
  it.each([['45', 45], ['45.5', 45.5], ['45.50', 45.5], ['0', 0], [' 12,50 ', 12.5], ['.5', 0.5]])(
    'accepts %s', (input, out) => expect(parsePrice(input)).toBe(out));
  it.each(['', 'abc', '-1', '12.505', '1e3', '1,234.50', '12..5', '99999999999', 'Infinity'])(
    'rejects %s', (input) => expect(parsePrice(input)).toBeNull());
});

describe('validateForm', () => {
  const ok = { barcode: ' 123 ', name: '  Basmati Rice ', unit: 'kg', price: '120', company: ' Pran ' };
  it('trims and converts', () => {
    expect(validateForm(ok)).toEqual({
      ok: true,
      value: { barcode: '123', name: 'Basmati Rice', unit: 'kg', selling_price: 120, company: 'Pran' },
    });
  });
  it('reports each bad field', () => {
    const r = validateForm({ barcode: '', name: ' ', unit: 'tonne', price: 'x', company: '' });
    expect(r).toEqual({
      ok: false,
      errors: {
        barcode: 'err.barcode.required', name: 'err.name.required', unit: 'err.unit.invalid',
        price: 'err.price.invalid', company: 'err.company.required',
      },
    });
  });
});
```
```ts
// src/lib/csv.test.ts
import { describe, expect, it } from 'vitest';
import { buildCsv } from './csv';
import type { Product } from '../data/types';

const p = (over: Partial<Product>): Product => ({
  id: '1', barcode: '123', name: 'Rice', unit: 'kg', selling_price: 10, company: 'Pran',
  created_at: '2026-10-03T19:49:00Z', created_by: 'u', updated_at: null, added_by_email: 'a@b.c', ...over,
});

describe('buildCsv', () => {
  it('writes header and rows with BOM', () => {
    const csv = buildCsv([p({})]);
    expect(csv.startsWith('﻿barcode,name,unit,selling_price,company,added_by,created_at')).toBe(true);
    expect(csv).toContain('123,Rice,kg,10.00,Pran,a@b.c,"4 Oct 2026, 1:49 AM"'); // date has a comma, so it is quoted
  });
  it('quotes commas, quotes and newlines', () => {
    const csv = buildCsv([p({ name: 'Salt, "fine"\nbag' })]);
    expect(csv).toContain('"Salt, ""fine""\nbag"');
  });
  it('neutralises spreadsheet formulas', () => {
    expect(buildCsv([p({ name: '=SUM(A1)' })])).toContain("'=SUM(A1)");
  });
});
```

- [ ] **Step 4: Run tests, verify they fail**

Run: `npx vitest run src/lib`
Expected: FAIL (modules do not exist).

- [ ] **Step 5: Implement the helpers**

```ts
// src/lib/emitter.ts
export function createEmitter<T = void>() {
  const listeners = new Set<(v: T) => void>();
  return {
    on(fn: (v: T) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    emit(v: T) { listeners.forEach((fn) => fn(v)); },
  };
}
```
```ts
// src/lib/format.ts
const dhakaParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short', year: 'numeric',
  hour: 'numeric', minute: '2-digit', hour12: true,
});
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }); // YYYY-MM-DD
const priceFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatDhaka(iso: string): string {
  const p = Object.fromEntries(dhakaParts.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${String(p.dayPeriod).toUpperCase()}`;
}
export function dhakaDayKey(d: Date | string): string {
  return dayFmt.format(typeof d === 'string' ? new Date(d) : d);
}
export const formatPrice = (n: number) => priceFmt.format(n);
```
```ts
// src/lib/barcode.ts
export const normalizeBarcode = (s: string) => s.trim();

/** A UPC-A code (12 digits) is an EAN-13 with a leading 0; scanners report either form. */
export function barcodeVariants(code: string): string[] {
  const c = normalizeBarcode(code);
  if (/^\d{12}$/.test(c)) return [c, `0${c}`];
  if (/^0\d{12}$/.test(c)) return [c, c.slice(1)];
  return [c];
}
```
```ts
// src/lib/validate.ts
import { UNITS, type NewProduct, type Unit } from '../data/types';
import type { MessageKey } from './i18n';
import { normalizeBarcode } from './barcode';

export interface FormInput { barcode: string; name: string; unit: string; price: string; company: string }
export type FieldErrors = Partial<Record<'barcode' | 'name' | 'unit' | 'price' | 'company', MessageKey>>;

/** Accepts 45, 45.5, 45.50, .5 and a single decimal comma (12,50). Max 10 integer digits (numeric(12,2)). */
export function parsePrice(input: string): number | null {
  let s = input.trim();
  if (/^\d*,\d{1,2}$/.test(s)) s = s.replace(',', '.');
  if (!/^(\d{1,10}(\.\d{1,2})?|\.\d{1,2})$/.test(s)) return null;
  return Number(s);
}

export function validateForm(i: FormInput):
  { ok: true; value: NewProduct } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const barcode = normalizeBarcode(i.barcode);
  const name = i.name.trim();
  const company = i.company.trim();
  const price = parsePrice(i.price);
  if (!barcode) errors.barcode = 'err.barcode.required';
  if (!name) errors.name = 'err.name.required';
  if (!(UNITS as readonly string[]).includes(i.unit)) errors.unit = 'err.unit.invalid';
  if (price === null) errors.price = 'err.price.invalid';
  if (!company) errors.company = 'err.company.required';
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { barcode, name, unit: i.unit as Unit, selling_price: price!, company } };
}
```
```ts
// src/lib/csv.ts
import type { Product } from '../data/types';
import { formatDhaka, formatPrice } from './format';

function cell(v: string): string {
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v; // stop spreadsheet formula injection
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function buildCsv(products: Product[]): string {
  const header = 'barcode,name,unit,selling_price,company,added_by,created_at';
  const rows = products.map((p) => [
    p.barcode, p.name, p.unit, formatPrice(p.selling_price).replace(/,/g, ''),
    p.company, p.added_by_email ?? '', formatDhaka(p.created_at),
  ].map(cell).join(','));
  return '﻿' + [header, ...rows].join('\r\n');
}
```
Note: `validate.ts` is imported by tests as `./validate` and exports `parsePrice`.

- [ ] **Step 6: Run tests, verify they pass**

Run: `npx vitest run src/lib && npx tsc --noEmit`
Expected: PASS. If `formatDhaka` output differs only by a narrow no-break space before AM/PM, fix by building from parts as above (already done); never by string replace.

---

### Task 4: Error mapping, Supabase client, and API module

**Files:**
- Create: `src/lib/env.ts`, `src/lib/supabase.ts`, `src/data/errors.ts`, `src/data/productsApi.ts`
- Test: `src/data/errors.test.ts`

**Interfaces:**
- Consumes: `Product`, `NewProduct`, `ApiErrorKind`, `MessageKey`.
- Produces:
  - `class ApiError extends Error { kind: ApiErrorKind; code?: string }`
  - `mapError(err: unknown): ApiError`, `errorKey(kind: ApiErrorKind): MessageKey`
  - `fetchByBarcodes(barcodes: string[]): Promise<Product | null>`
  - `fetchChangedSince(since: string | null): Promise<Product[]>` (since = ISO or null for all)
  - `insertProduct(p: NewProduct & { id: string }, authorEmail: string | null): Promise<Product>`
  - `updateProduct(id: string, patch: Partial<Omit<NewProduct, 'barcode'>>): Promise<Product>`
  - `fetchProfileRole(userId: string): Promise<'owner' | 'employee'>`
  - `env.configured: boolean`, `supabase`

- [ ] **Step 1: Write the failing test `src/data/errors.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { mapError } from './errors';

describe('mapError', () => {
  it('maps duplicate barcode vs duplicate product by constraint name', () => {
    expect(mapError({ code: '23505', message: 'duplicate key value violates unique constraint "products_barcode_key"' }).kind).toBe('duplicate_barcode');
    expect(mapError({ code: '23505', message: 'duplicate key value violates unique constraint "products_name_company_unit_key"' }).kind).toBe('duplicate_product');
  });
  it('maps check violations and bad input to validation', () => {
    expect(mapError({ code: '23514', message: 'x' }).kind).toBe('validation');
    expect(mapError({ code: '22P02', message: 'x' }).kind).toBe('validation');
  });
  it('maps RLS denial to permission', () => {
    expect(mapError({ code: '42501', message: 'new row violates row-level security policy' }).kind).toBe('permission');
  });
  it('maps expired JWT to auth', () => {
    expect(mapError({ code: 'PGRST301', message: 'JWT expired' }).kind).toBe('auth');
    expect(mapError({ message: 'Invalid JWT', status: 401 }).kind).toBe('auth');
  });
  it('maps fetch failures to network', () => {
    expect(mapError(new TypeError('Failed to fetch')).kind).toBe('network');
    expect(mapError({ message: 'TypeError: Load failed' }).kind).toBe('network');
    expect(mapError({ message: 'NetworkError when attempting to fetch resource.' }).kind).toBe('network');
  });
  it('falls back to unknown and passes ApiError through', () => {
    expect(mapError({ code: 'XX000', message: 'boom' }).kind).toBe('unknown');
    const e = mapError({ code: '42501', message: 'x' });
    expect(mapError(e)).toBe(e);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `npx vitest run src/data/errors.test.ts`  Expected: FAIL.

- [ ] **Step 3: Implement `src/data/errors.ts`**

```ts
import type { ApiErrorKind } from './types';
import type { MessageKey } from '../lib/i18n';

export class ApiError extends Error {
  constructor(public kind: ApiErrorKind, message: string, public code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export function mapError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const e = (err ?? {}) as { code?: string; message?: string; status?: number };
  const msg = e.message ?? String(err);
  const code = e.code;
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) return new ApiError('network', msg, code);
  if (code === '23505') {
    return new ApiError(msg.includes('products_barcode_key') ? 'duplicate_barcode' : 'duplicate_product', msg, code);
  }
  if (code === '23514' || code === '22P02' || code === '22003' || code === '23502') return new ApiError('validation', msg, code);
  if (code === 'PGRST301' || e.status === 401 || /jwt expired|invalid jwt/i.test(msg)) return new ApiError('auth', msg, code);
  if (code === '42501') return new ApiError('permission', msg, code);
  return new ApiError('unknown', msg, code);
}

const KEYS: Record<ApiErrorKind, MessageKey> = {
  network: 'err.network', auth: 'err.auth', duplicate_barcode: 'err.duplicateBarcode',
  duplicate_product: 'err.duplicateProduct', validation: 'err.validation',
  permission: 'err.permission', unknown: 'err.unknown',
};
export const errorKey = (kind: ApiErrorKind): MessageKey => KEYS[kind];
```

- [ ] **Step 4: Implement env, client and API**

```ts
// src/lib/env.ts
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const env = { supabaseUrl: url ?? '', supabaseKey: key ?? '', configured: Boolean(url && key) };
```
```ts
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import { env } from './env';

export const supabase = createClient(env.supabaseUrl || 'http://localhost', env.supabaseKey || 'missing', {
  auth: { persistSession: true, autoRefreshToken: true },
});
```
```ts
// src/data/productsApi.ts
import { supabase } from '../lib/supabase';
import { mapError } from './errors';
import type { NewProduct, Product } from './types';

const BASE_COLS = 'id,barcode,name,unit,selling_price,company,created_at,created_by,updated_at';
const VIEW_COLS = `${BASE_COLS},added_by_email`;
const PAGE = 1000;

/** Supabase returns {error} for server errors but can also throw (fetch failures). Normalise both. */
async function guard<T>(run: () => PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> {
  try {
    const { data, error } = await run();
    if (error) throw error;
    return data;
  } catch (e) {
    throw mapError(e);
  }
}

export async function fetchByBarcodes(barcodes: string[]): Promise<Product | null> {
  const rows = await guard(() =>
    supabase.from('products_with_author').select(VIEW_COLS).in('barcode', barcodes).limit(1));
  return ((rows as Product[] | null) ?? [])[0] ?? null;
}

export async function fetchChangedSince(since: string | null): Promise<Product[]> {
  const out: Product[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from('products_with_author').select(VIEW_COLS)
      .order('updated_at', { ascending: true }).order('id').range(from, from + PAGE - 1);
    if (since) q = q.gte('updated_at', since);
    const rows = ((await guard(() => q)) as Product[] | null) ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

export async function insertProduct(p: NewProduct & { id: string }, authorEmail: string | null): Promise<Product> {
  const row = await guard(() => supabase.from('products').insert(p).select(BASE_COLS).single());
  return { ...(row as Omit<Product, 'added_by_email'>), added_by_email: authorEmail };
}

export async function updateProduct(id: string, patch: Partial<Omit<NewProduct, 'barcode'>>): Promise<Product> {
  const rows = ((await guard(() => supabase.from('products').update(patch).eq('id', id).select(BASE_COLS))) as
    Omit<Product, 'added_by_email'>[] | null) ?? [];
  if (!rows[0]) throw mapError({ code: '42501', message: 'update affected no rows' }); // RLS hides the row
  const full = await fetchByBarcodes([rows[0].barcode]);
  return full ?? { ...rows[0], added_by_email: null };
}

export async function fetchProfileRole(userId: string): Promise<'owner' | 'employee'> {
  const row = await guard(() => supabase.from('profiles').select('role').eq('id', userId).single());
  return (row as { role: string } | null)?.role === 'owner' ? 'owner' : 'employee';
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/data/errors.test.ts && npx tsc --noEmit`  Expected: PASS.

---

### Task 5: IndexedDB layer and product cache

**Files:**
- Create: `src/data/db.ts`, `src/data/productCache.ts`
- Test: `src/data/productCache.test.ts`

**Interfaces:**
- Consumes: `Product`, `QueueItem`, `createEmitter`.
- Produces:
  - `getDb()`, `resetDbForTests()`, store names `products` (key `barcode`), `queue` (key `id`), `meta`
  - `cache.getByBarcodes(b: string[]): Promise<Product | undefined>`, `cache.put(p)`, `cache.putMany(ps)`, `cache.remove(barcode)`, `cache.getAll(): Promise<Product[]>`, `cache.replaceAll(ps)` (keeps rows with `pending: true`), `cache.getMeta<T>(k)`, `cache.setMeta(k, v)`, `cache.onChange(fn)`, `cache.findDuplicateTriple(n: NewProduct)`

- [ ] **Step 1: Write failing test `src/data/productCache.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDbForTests } from './db';
import * as cache from './productCache';
import type { Product } from './types';

const p = (barcode: string, over: Partial<Product> = {}): Product => ({
  id: barcode, barcode, name: `N${barcode}`, unit: 'pcs', selling_price: 1, company: 'Co',
  created_at: '2026-10-04T00:00:00Z', created_by: 'u', updated_at: null, added_by_email: null, ...over,
});

beforeEach(resetDbForTests);

describe('productCache', () => {
  it('puts and finds by any of several barcodes', async () => {
    await cache.put(p('111'));
    expect((await cache.getByBarcodes(['999', '111']))?.id).toBe('111');
    expect(await cache.getByBarcodes(['999'])).toBeUndefined();
  });
  it('replaceAll drops server rows that disappeared but keeps pending local rows', async () => {
    await cache.putMany([p('1'), p('2'), p('3', { pending: true })]);
    await cache.replaceAll([p('2')]);
    expect((await cache.getAll()).map((x) => x.barcode).sort()).toEqual(['2', '3']);
  });
  it('finds a duplicate name+company+unit ignoring case and spacing', async () => {
    await cache.put(p('1', { name: 'Basmati Rice', company: 'Pran', unit: 'kg' }));
    const dup = await cache.findDuplicateTriple({ barcode: '2', name: '  basmati  RICE', company: 'PRAN ', unit: 'kg', selling_price: 1 });
    expect(dup?.barcode).toBe('1');
    expect(await cache.findDuplicateTriple({ barcode: '2', name: 'Basmati Rice', company: 'Pran', unit: 'g', selling_price: 1 })).toBeUndefined();
  });
  it('stores meta and notifies listeners on change', async () => {
    let n = 0;
    const off = cache.onChange(() => { n++; });
    await cache.put(p('1'));
    await cache.setMeta('lastSync', 'x');
    expect(await cache.getMeta('lastSync')).toBe('x');
    off();
    expect(n).toBe(1);
  });
});
```

- [ ] **Step 2: Run, verify FAIL.**

Run: `npx vitest run src/data/productCache.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/data/db.ts
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Product, QueueItem } from './types';

interface Schema extends DBSchema {
  products: { key: string; value: Product };
  queue: { key: string; value: QueueItem };
  meta: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

export function getDb() {
  return (dbPromise ??= openDB<Schema>('shop-entry', 1, {
    upgrade(db) {
      db.createObjectStore('products', { keyPath: 'barcode' });
      db.createObjectStore('queue', { keyPath: 'id' });
      db.createObjectStore('meta');
    },
  }));
}

export async function resetDbForTests() {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
  await new Promise<void>((res, rej) => {
    const r = indexedDB.deleteDatabase('shop-entry');
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}
```
```ts
// src/data/productCache.ts
import { getDb } from './db';
import { createEmitter } from '../lib/emitter';
import type { NewProduct, Product } from './types';

const changes = createEmitter();
export const onChange = (fn: () => void) => changes.on(fn);

export async function getByBarcodes(barcodes: string[]): Promise<Product | undefined> {
  const db = await getDb();
  for (const b of barcodes) {
    const hit = await db.get('products', b);
    if (hit) return hit;
  }
  return undefined;
}
export async function getAll(): Promise<Product[]> {
  return (await getDb()).getAll('products');
}
export async function put(p: Product) {
  await (await getDb()).put('products', p);
  changes.emit();
}
export async function putMany(ps: Product[]) {
  const db = await getDb();
  const tx = db.transaction('products', 'readwrite');
  await Promise.all([...ps.map((p) => tx.store.put(p)), tx.done]);
  changes.emit();
}
export async function remove(barcode: string) {
  await (await getDb()).delete('products', barcode);
  changes.emit();
}
/** Replace server-known rows; locally pending rows are kept until the queue confirms them. */
export async function replaceAll(ps: Product[]) {
  const db = await getDb();
  const tx = db.transaction('products', 'readwrite');
  const existing = await tx.store.getAll();
  const fresh = new Set(ps.map((p) => p.barcode));
  await Promise.all([
    ...existing.filter((e) => !e.pending && !fresh.has(e.barcode)).map((e) => tx.store.delete(e.barcode)),
    ...ps.map((p) => tx.store.put(p)),
    tx.done,
  ]);
  changes.emit();
}

const norm = (s: string) => s.trim().toLowerCase();
export async function findDuplicateTriple(n: NewProduct): Promise<Product | undefined> {
  const all = await getAll();
  return all.find((p) => norm(p.name) === norm(n.name) && norm(p.company) === norm(n.company) && p.unit.toLowerCase() === n.unit.toLowerCase());
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await (await getDb()).get('meta', key)) as T | undefined;
}
export async function setMeta(key: string, value: unknown) {
  await (await getDb()).put('meta', value, key);
}
```
Note: `setMeta` must not emit `changes` (the test asserts exactly 1 notification).

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/data/productCache.test.ts && npx tsc --noEmit`  Expected: PASS.

---

### Task 6: Offline queue

**Files:**
- Create: `src/data/offlineQueue.ts`
- Test: `src/data/offlineQueue.test.ts`

**Interfaces:**
- Consumes: `insertProduct`, `fetchByBarcodes` (productsApi), `ApiError`, `mapError`, `cache`, `getDb`.
- Produces:
  - `enqueue(product: NewProduct, id: string, authorEmail: string | null): Promise<void>`
  - `isQueued(barcode: string): Promise<boolean>`
  - `list(): Promise<QueueItem[]>`, `visibleCount(items: QueueItem[]): number` (items with `attempts > 0` or `status === 'attention'`, so the badge does not flash during a normal fast save)
  - `flush(): Promise<void>` (single-flight)
  - `retry(id)`, `discard(id)`
  - `onChange(fn)`; `onNotice(fn: (n: QueueNotice) => void)` where `QueueNotice = { key: MessageKey; params: Record<string, string> }`

- [ ] **Step 1: Write failing tests**

```ts
// src/data/offlineQueue.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDbForTests } from './db';
import { ApiError } from './errors';
import * as api from './productsApi';
import * as cache from './productCache';
import * as q from './offlineQueue';
import type { NewProduct, Product } from './types';

vi.mock('./productsApi', () => ({ insertProduct: vi.fn(), fetchByBarcodes: vi.fn() }));
const insert = vi.mocked(api.insertProduct);
const fetchBy = vi.mocked(api.fetchByBarcodes);

const np = (barcode: string): NewProduct => ({ barcode, name: `N${barcode}`, unit: 'pcs', selling_price: 5, company: 'Co' });
const saved = (id: string, barcode: string): Product => ({ ...np(barcode), id, created_at: 'x', created_by: 'u', updated_at: null, added_by_email: 'e' });

beforeEach(async () => { await resetDbForTests(); vi.resetAllMocks(); });

describe('offlineQueue', () => {
  it('flushes in order, caches the saved row and empties the queue', async () => {
    await q.enqueue(np('1'), 'id1', 'e');
    await q.enqueue(np('2'), 'id2', 'e');
    insert.mockImplementation(async (p) => saved(p.id, p.barcode));
    await q.flush();
    expect(insert.mock.calls.map((c) => c[0].id)).toEqual(['id1', 'id2']);
    expect(await q.list()).toEqual([]);
    expect((await cache.getByBarcodes(['1']))?.pending).toBeUndefined();
  });

  it('keeps items and stops on a network error, then succeeds later', async () => {
    await q.enqueue(np('1'), 'id1', 'e');
    await q.enqueue(np('2'), 'id2', 'e');
    insert.mockRejectedValueOnce(new ApiError('network', 'Failed to fetch'));
    await q.flush();
    expect(insert).toHaveBeenCalledTimes(1);
    const items = await q.list();
    expect(items).toHaveLength(2);
    expect(items[0].attempts).toBe(1);
    expect(q.visibleCount(items)).toBe(1);
    insert.mockImplementation(async (p) => saved(p.id, p.barcode));
    await q.flush();
    expect(await q.list()).toEqual([]);
  });

  it('keeps items pending (not failed) when the session expired', async () => {
    await q.enqueue(np('1'), 'id1', 'e');
    insert.mockRejectedValueOnce(new ApiError('auth', 'JWT expired'));
    await q.flush();
    const [item] = await q.list();
    expect(item.status).toBe('pending');
    expect(item.attempts).toBe(1);
  });

  it('treats a duplicate barcode that is our own earlier insert as success', async () => {
    await q.enqueue(np('1'), 'id1', 'e');
    insert.mockRejectedValueOnce(new ApiError('duplicate_barcode', 'x'));
    fetchBy.mockResolvedValueOnce(saved('id1', '1'));
    const notices = vi.fn();
    q.onNotice(notices);
    await q.flush();
    expect(await q.list()).toEqual([]);
    expect(notices).not.toHaveBeenCalled();
  });

  it('drops a duplicate barcode added by someone else, caches theirs, and notifies', async () => {
    await cache.put({ ...saved('id1', '1'), pending: true });
    await q.enqueue(np('1'), 'id1', 'e');
    insert.mockRejectedValueOnce(new ApiError('duplicate_barcode', 'x'));
    fetchBy.mockResolvedValueOnce(saved('other', '1'));
    const notices = vi.fn();
    q.onNotice(notices);
    await q.flush();
    expect(await q.list()).toEqual([]);
    expect((await cache.getByBarcodes(['1']))?.id).toBe('other');
    expect(notices).toHaveBeenCalledWith({ key: 'notice.conflictBarcode', params: { barcode: '1' } });
  });

  it('drops a duplicate name+company+unit and removes the ghost cache row', async () => {
    await cache.put({ ...saved('id1', '1'), pending: true });
    await q.enqueue(np('1'), 'id1', 'e');
    insert.mockRejectedValueOnce(new ApiError('duplicate_product', 'x'));
    const notices = vi.fn();
    q.onNotice(notices);
    await q.flush();
    expect(await q.list()).toEqual([]);
    expect(await cache.getByBarcodes(['1'])).toBeUndefined();
    expect(notices).toHaveBeenCalledWith({ key: 'notice.conflictProduct', params: { name: 'N1' } });
  });

  it('marks permission errors as needing attention and does not retry them on flush', async () => {
    await q.enqueue(np('1'), 'id1', 'e');
    insert.mockRejectedValueOnce(new ApiError('permission', 'denied'));
    await q.flush();
    const [item] = await q.list();
    expect(item.status).toBe('attention');
    insert.mockClear();
    await q.flush();
    expect(insert).not.toHaveBeenCalled();
    await q.retry('id1');
    expect((await q.list())[0].status).toBe('pending');
    await q.discard('id1');
    expect(await q.list()).toEqual([]);
  });

  it('knows which barcodes are already queued (double-tap guard)', async () => {
    await q.enqueue(np('1'), 'id1', 'e');
    expect(await q.isQueued('1')).toBe(true);
    expect(await q.isQueued('2')).toBe(false);
  });

  it('runs a single flush at a time', async () => {
    await q.enqueue(np('1'), 'id1', 'e');
    insert.mockImplementation(async (p) => saved(p.id, p.barcode));
    await Promise.all([q.flush(), q.flush(), q.flush()]);
    expect(insert).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `npx vitest run src/data/offlineQueue.test.ts`

- [ ] **Step 3: Implement `src/data/offlineQueue.ts`**

```ts
import { getDb } from './db';
import { ApiError, mapError } from './errors';
import { fetchByBarcodes, insertProduct } from './productsApi';
import * as cache from './productCache';
import { createEmitter } from '../lib/emitter';
import type { MessageKey } from '../lib/i18n';
import type { NewProduct, Product, QueueItem } from './types';

export interface QueueNotice { key: MessageKey; params: Record<string, string> }

const changes = createEmitter();
const notices = createEmitter<QueueNotice>();
export const onChange = (fn: () => void) => changes.on(fn);
export const onNotice = (fn: (n: QueueNotice) => void) => notices.on(fn);

export async function list(): Promise<QueueItem[]> {
  const items = await (await getDb()).getAll('queue');
  return items.sort((a, b) => a.createdAt - b.createdAt);
}
export const visibleCount = (items: QueueItem[]) =>
  items.filter((i) => i.attempts > 0 || i.status === 'attention').length;

export async function isQueued(barcode: string): Promise<boolean> {
  return (await list()).some((i) => i.product.barcode === barcode);
}

export async function enqueue(product: NewProduct, id: string, authorEmail: string | null) {
  const item: QueueItem = { id, product, authorEmail, status: 'pending', attempts: 0, createdAt: Date.now() };
  await (await getDb()).put('queue', item);
  changes.emit();
}

async function save(item: QueueItem) {
  await (await getDb()).put('queue', item);
  changes.emit();
}
async function drop(id: string) {
  await (await getDb()).delete('queue', id);
  changes.emit();
}

async function succeed(item: QueueItem, row: Product) {
  await cache.put({ ...row, pending: undefined });
  await drop(item.id);
}

let running: Promise<void> | null = null;
export function flush(): Promise<void> {
  return (running ??= run().finally(() => { running = null; }));
}

async function run() {
  for (const item of (await list()).filter((i) => i.status === 'pending')) {
    try {
      await succeed(item, await insertProduct({ ...item.product, id: item.id }, item.authorEmail));
    } catch (e) {
      const err = e instanceof ApiError ? e : mapError(e);
      if (err.kind === 'network' || err.kind === 'auth') {
        await save({ ...item, attempts: item.attempts + 1 });
        return; // still offline / signed out: keep everything, try again later
      }
      if (err.kind === 'duplicate_barcode') {
        const existing = await fetchByBarcodes([item.product.barcode]).catch(() => null);
        if (existing?.id === item.id) { await succeed(item, existing); continue; } // our own earlier insert
        if (existing) await cache.put(existing);
        await drop(item.id);
        notices.emit({ key: 'notice.conflictBarcode', params: { barcode: item.product.barcode } });
      } else if (err.kind === 'duplicate_product') {
        await cache.remove(item.product.barcode);
        await drop(item.id);
        notices.emit({ key: 'notice.conflictProduct', params: { name: item.product.name } });
      } else {
        await cache.remove(item.product.barcode);
        await save({ ...item, status: 'attention', error: err.message });
      }
    }
  }
}

export async function retry(id: string) {
  const item = await (await getDb()).get('queue', id);
  if (item) { await save({ ...item, status: 'pending', attempts: 0, error: undefined }); void flush(); }
}
export const discard = drop;
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/data && npx tsc --noEmit`  Expected: PASS.

---

### Task 7: Repository facade and auto-sync

**Files:**
- Create: `src/data/productRepo.ts`, `src/data/autoSync.ts`
- Test: `src/data/productRepo.test.ts`

**Interfaces:**
- Consumes: Task 3-6 exports.
- Produces (the only data API for the UI):
  - `lookup(barcode: string): Promise<{ product: Product | null; offline: boolean }>`
  - `save(input: NewProduct, user: { id: string; email: string | null }): Promise<{ status: 'accepted'; id: string } | { status: 'duplicate-product'; existing: Product } | { status: 'duplicate-pending' }>`
  - `update(id: string, patch: Partial<Omit<NewProduct, 'barcode'>>): Promise<Product>`
  - `sync(): Promise<boolean>` (delta sync; full refresh if last full sync > 24 h; returns false on network failure)
  - `searchProducts(all: Product[], query: string): Product[]` (sorted newest first)
  - `distinctCompanies(all: Product[]): string[]`
  - `addedTodayCount(all: Product[], userId: string, now?: Date): number`
  - `fetchAllForExport(): Promise<Product[]>` (server first, cache fallback)
  - `startAutoSync(): () => void`
  - re-exports: `onProductsChange = cache.onChange`, `getAllProducts = cache.getAll`, `queue = { list, onChange, onNotice, flush, retry, discard, visibleCount }`

- [ ] **Step 1: Write failing tests `src/data/productRepo.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDbForTests } from './db';
import { ApiError } from './errors';
import * as api from './productsApi';
import * as cache from './productCache';
import * as q from './offlineQueue';
import * as repo from './productRepo';
import type { NewProduct, Product } from './types';

vi.mock('./productsApi', () => ({
  insertProduct: vi.fn(), fetchByBarcodes: vi.fn(), fetchChangedSince: vi.fn(), updateProduct: vi.fn(),
}));
const A = vi.mocked(api);

const np = (barcode: string, over: Partial<NewProduct> = {}): NewProduct =>
  ({ barcode, name: `N${barcode}`, unit: 'pcs', selling_price: 5, company: 'Co', ...over });
const row = (barcode: string, over: Partial<Product> = {}): Product => ({
  ...np(barcode), id: `id${barcode}`, created_at: '2026-10-04T05:00:00Z', created_by: 'u1',
  updated_at: null, added_by_email: 'e', ...over,
});
const user = { id: 'u1', email: 'e@x.com' };

beforeEach(async () => { await resetDbForTests(); vi.resetAllMocks(); });

describe('lookup', () => {
  it('answers from the cache without calling the server', async () => {
    await cache.put(row('111'));
    const r = await repo.lookup(' 111 ');
    expect(r.product?.barcode).toBe('111');
    expect(A.fetchByBarcodes).not.toHaveBeenCalled();
  });
  it('finds a UPC-A product stored as EAN-13 and vice versa', async () => {
    await cache.put(row('0036000291452'));
    expect((await repo.lookup('036000291452')).product?.barcode).toBe('0036000291452');
  });
  it('falls back to the server and caches the result', async () => {
    A.fetchByBarcodes.mockResolvedValueOnce(row('222'));
    expect((await repo.lookup('222')).product?.id).toBe('id222');
    expect((await cache.getByBarcodes(['222']))?.id).toBe('id222');
  });
  it('returns null (not found) when the server has nothing', async () => {
    A.fetchByBarcodes.mockResolvedValueOnce(null);
    expect(await repo.lookup('333')).toEqual({ product: null, offline: false });
  });
  it('reports offline when the server is unreachable and the cache misses', async () => {
    A.fetchByBarcodes.mockRejectedValueOnce(new ApiError('network', 'x'));
    expect(await repo.lookup('444')).toEqual({ product: null, offline: true });
  });
  it('rethrows non-network errors', async () => {
    A.fetchByBarcodes.mockRejectedValueOnce(new ApiError('auth', 'x'));
    await expect(repo.lookup('555')).rejects.toMatchObject({ kind: 'auth' });
  });
});

describe('save', () => {
  it('stores a pending row locally, queues it, and syncs in the background', async () => {
    A.insertProduct.mockImplementation(async (p) => row(p.barcode, { id: p.id }));
    const r = await repo.save(np('1'), user);
    expect(r.status).toBe('accepted');
    expect((await cache.getByBarcodes(['1']))?.pending).toBe(true); // visible immediately
    await q.flush();
    expect(A.insertProduct).toHaveBeenCalledTimes(1);
    expect((await cache.getByBarcodes(['1']))?.pending).toBeUndefined();
    expect(await q.list()).toEqual([]);
  });
  it('stays queued when offline', async () => {
    A.insertProduct.mockRejectedValue(new ApiError('network', 'x'));
    await repo.save(np('1'), user);
    await q.flush();
    expect(q.visibleCount(await q.list())).toBe(1);
  });
  it('refuses a same name+company+unit locally, before any network call', async () => {
    await cache.put(row('9', { name: 'Rice', company: 'Pran', unit: 'kg' }));
    const r = await repo.save(np('1', { name: ' rice ', company: 'PRAN', unit: 'kg' }), user);
    expect(r.status).toBe('duplicate-product');
    expect(A.insertProduct).not.toHaveBeenCalled();
  });
  it('ignores a second save of the same barcode (double tap)', async () => {
    A.insertProduct.mockRejectedValue(new ApiError('network', 'x'));
    await repo.save(np('1'), user);
    const second = await repo.save(np('1', { name: 'Other' }), user);
    expect(second.status).toBe('duplicate-pending');
    expect(await q.list()).toHaveLength(1);
  });
});

describe('pure helpers', () => {
  const all = [
    row('1', { name: 'Basmati Rice', company: 'Pran', created_at: '2026-10-01T00:00:00Z' }),
    row('2', { name: 'Soap', company: 'Lux', created_at: '2026-10-03T00:00:00Z' }),
    row('3', { name: 'Salt', company: 'pran', created_at: '2026-10-02T00:00:00Z' }),
  ];
  it('searches name, barcode and company, newest first', () => {
    expect(repo.searchProducts(all, 'pran').map((p) => p.barcode)).toEqual(['3', '1']);
    expect(repo.searchProducts(all, '2').map((p) => p.barcode)).toEqual(['2']);
    expect(repo.searchProducts(all, '  ').map((p) => p.barcode)).toEqual(['2', '3', '1']);
  });
  it('lists distinct companies case-insensitively, keeping the first spelling', () => {
    expect(repo.distinctCompanies([all[2], all[0], all[1]])).toEqual(['Lux', 'pran']);
  });
  it('counts what this user added today in Dhaka time', () => {
    const now = new Date('2026-10-04T10:00:00Z'); // 4 Oct, 4pm Dhaka
    const mine = (iso: string, by = 'u1') => row(iso, { created_at: iso, created_by: by });
    const items = [
      mine('2026-10-03T23:30:00Z'), // 4 Oct 05:30 Dhaka -> today
      mine('2026-10-03T17:00:00Z'), // 3 Oct 23:00 Dhaka -> yesterday
      mine('2026-10-04T01:00:00Z', 'u2'), // someone else
    ];
    expect(repo.addedTodayCount(items, 'u1', now)).toBe(1);
  });
});

describe('sync', () => {
  it('does a full refresh the first time, then deltas', async () => {
    A.fetchChangedSince.mockResolvedValueOnce([row('1', { updated_at: '2026-10-04T01:00:00Z' })]);
    expect(await repo.sync()).toBe(true);
    expect(A.fetchChangedSince).toHaveBeenLastCalledWith(null);
    A.fetchChangedSince.mockResolvedValueOnce([]);
    await repo.sync();
    expect(A.fetchChangedSince).toHaveBeenLastCalledWith('2026-10-04T01:00:00Z');
  });
  it('returns false when offline', async () => {
    A.fetchChangedSince.mockRejectedValueOnce(new ApiError('network', 'x'));
    expect(await repo.sync()).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `npx vitest run src/data/productRepo.test.ts`

- [ ] **Step 3: Implement `src/data/productRepo.ts`**

```ts
import * as api from './productsApi';
import * as cache from './productCache';
import * as queue from './offlineQueue';
import { mapError } from './errors';
import { barcodeVariants } from '../lib/barcode';
import { dhakaDayKey } from '../lib/format';
import type { NewProduct, Product } from './types';

export { queue };
export const onProductsChange = cache.onChange;
export const getAllProducts = cache.getAll;

export async function lookup(barcode: string): Promise<{ product: Product | null; offline: boolean }> {
  const variants = barcodeVariants(barcode);
  const cached = await cache.getByBarcodes(variants);
  if (cached) return { product: cached, offline: false };
  try {
    const found = await api.fetchByBarcodes(variants);
    if (found) await cache.put(found);
    return { product: found, offline: false };
  } catch (e) {
    const err = mapError(e);
    if (err.kind === 'network') return { product: null, offline: true };
    throw err;
  }
}

export type SaveResult =
  | { status: 'accepted'; id: string }
  | { status: 'duplicate-product'; existing: Product }
  | { status: 'duplicate-pending' };

/** Optimistic: resolves as soon as the product is stored locally; the insert runs in the background. */
export async function save(input: NewProduct, user: { id: string; email: string | null }): Promise<SaveResult> {
  if (await queue.isQueued(input.barcode)) return { status: 'duplicate-pending' };
  const existing = await cache.findDuplicateTriple(input);
  if (existing) return { status: 'duplicate-product', existing };
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await cache.put({ ...input, id, created_at: now, created_by: user.id, updated_at: now, added_by_email: user.email, pending: true });
  await queue.enqueue(input, id, user.email);
  void queue.flush();
  return { status: 'accepted', id };
}

export async function update(id: string, patch: Partial<Omit<NewProduct, 'barcode'>>): Promise<Product> {
  const updated = await api.updateProduct(id, patch);
  await cache.put(updated);
  return updated;
}

const DAY = 24 * 60 * 60 * 1000;
export async function sync(): Promise<boolean> {
  try {
    const lastFull = await cache.getMeta<number>('lastFullSync');
    const full = !lastFull || Date.now() - lastFull > DAY;
    const rows = await api.fetchChangedSince(full ? null : ((await cache.getMeta<string>('lastSync')) ?? null));
    if (full) { await cache.replaceAll(rows); await cache.setMeta('lastFullSync', Date.now()); }
    else await cache.putMany(rows);
    const newest = rows.map((r) => r.updated_at ?? '').sort().pop();
    if (newest) await cache.setMeta('lastSync', newest);
    return true;
  } catch (e) {
    const err = mapError(e);
    if (err.kind === 'network' || err.kind === 'auth') return false;
    throw err;
  }
}

export async function fetchAllForExport(): Promise<Product[]> {
  try { return await api.fetchChangedSince(null); } catch { return cache.getAll(); }
}

export function searchProducts(all: Product[], query: string): Product[] {
  const q = query.trim().toLowerCase();
  const hits = q
    ? all.filter((p) => p.name.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q) || p.company.toLowerCase().includes(q))
    : [...all];
  return hits.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function distinctCompanies(all: Product[]): string[] {
  const seen = new Map<string, string>();
  for (const p of all) {
    const key = p.company.trim().toLowerCase();
    if (!seen.has(key)) seen.set(key, p.company.trim());
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export function addedTodayCount(all: Product[], userId: string, now = new Date()): number {
  const today = dhakaDayKey(now);
  return all.filter((p) => p.created_by === userId && dhakaDayKey(p.created_at) === today).length;
}
```
Fix while implementing: in the test `distinctCompanies([all[2], all[0], all[1]])` input order is Salt/`pran`, Rice/`Pran`, Soap/`Lux`, so the expected first spelling is `pran` (matches the assertion `['Lux', 'pran']`).

- [ ] **Step 4: Implement `src/data/autoSync.ts`**

```ts
import { queue, sync } from './productRepo';

/** Flush the offline queue and refresh the cache on start, reconnect, app focus and every 30 s. */
export function startAutoSync(): () => void {
  const tick = () => { void queue.flush(); void sync(); };
  const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
  tick();
  window.addEventListener('online', tick);
  document.addEventListener('visibilitychange', onVisible);
  const timer = window.setInterval(() => void queue.flush(), 30_000);
  return () => {
    window.removeEventListener('online', tick);
    document.removeEventListener('visibilitychange', onVisible);
    window.clearInterval(timer);
  };
}
```

- [ ] **Step 5: Run all tests and typecheck**

Run: `npx vitest run && npx tsc --noEmit`  Expected: PASS.

---

### Task 8: Auth, app shell, shared UI components

**Files:**
- Create: `src/auth/AuthProvider.tsx`, `src/auth/LoginScreen.tsx`, `src/components/{BottomSheet,TabBar,Toast,PendingBadge}.tsx`, `src/features/shared/hooks.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `supabase`, `fetchProfileRole`, `t`, repo exports.
- Produces:
  - `useAuth(): { user: { id: string; email: string | null } | null; isOwner: boolean; loading: boolean; signIn(email: string, password: string): Promise<boolean>; signOut(): Promise<void> }`
  - `<BottomSheet title: string; onClose(): void; children>`
  - `toast(message: string, kind?: 'success' | 'error' | 'info')`, `<Toaster />`
  - `<PendingBadge />`
  - hooks `useProducts(): Product[]`, `useQueueItems(): QueueItem[]`
  - `type Tab = 'scan' | 'products' | 'account'`

- [ ] **Step 1: Write `src/features/shared/hooks.ts`**

```ts
import { useEffect, useState } from 'react';
import { getAllProducts, onProductsChange, queue } from '../../data/productRepo';
import type { Product, QueueItem } from '../../data/types';

export function useProducts(): Product[] {
  const [items, setItems] = useState<Product[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => void getAllProducts().then((p) => alive && setItems(p));
    load();
    const off = onProductsChange(load);
    return () => { alive = false; off(); };
  }, []);
  return items;
}

export function useQueueItems(): QueueItem[] {
  const [items, setItems] = useState<QueueItem[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => void queue.list().then((i) => alive && setItems(i));
    load();
    const off = queue.onChange(load);
    return () => { alive = false; off(); };
  }, []);
  return items;
}
```

- [ ] **Step 2: Write `src/auth/AuthProvider.tsx`**

```tsx
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { fetchProfileRole } from '../data/productsApi';

interface AuthState {
  user: { id: string; email: string | null } | null;
  isOwner: boolean;
  loading: boolean;
  signIn(email: string, password: string): Promise<boolean>;
  signOut(): Promise<void>;
}
const Ctx = createContext<AuthState | null>(null);

const roleKey = (uid: string) => `role:${uid}`;
const readRole = (uid: string) => { try { return localStorage.getItem(roleKey(uid)); } catch { return null; } };
const writeRole = (uid: string, r: string) => { try { localStorage.setItem(roleKey(uid), r); } catch { /* storage blocked */ } };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id;
  useEffect(() => {
    if (!uid || !session) { setRole(null); return; }
    if (session.user.app_metadata?.role === 'owner') { setRole('owner'); return; }
    setRole(readRole(uid)); // works offline
    fetchProfileRole(uid).then((r) => { setRole(r); writeRole(uid, r); }).catch(() => { /* keep cached role */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const value = useMemo<AuthState>(() => ({
    user: session ? { id: session.user.id, email: session.user.email ?? null } : null,
    isOwner: role === 'owner',
    loading,
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      return !error;
    },
    async signOut() { await supabase.auth.signOut(); },
  }), [session, role, loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
```

- [ ] **Step 3: Write `src/auth/LoginScreen.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { useAuth } from './AuthProvider';
import { t } from '../lib/i18n';
import { warmCameraPermission } from '../scanner/feedback';

export function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setFailed(false);
    void warmCameraPermission(); // inside the tap, so the browser allows the permission prompt now
    const ok = await signIn(email, password);
    if (!ok) { setFailed(true); setBusy(false); }
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-6 p-6 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div>
        <div className="mb-3 grid size-14 place-items-center rounded-2xl bg-accent text-2xl text-accent-fg" aria-hidden>▌▌▐</div>
        <h1 className="text-2xl font-bold">{t('app.name')}</h1>
        <p className="mt-1 text-muted">{t('login.hint')}</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t('login.email')}
          <input className="input" type="email" autoComplete="username" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t('login.password')}
          <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {failed && <p role="alert" className="text-sm font-medium text-danger">{t('login.failed')}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? t('login.busy') : t('login.submit')}</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Write the shared components**

```tsx
// src/components/BottomSheet.tsx
import { useEffect, useRef, type ReactNode } from 'react';

export function BottomSheet({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" aria-hidden />
      <div
        ref={ref} role="dialog" aria-modal="true" aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="sheet-enter relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-bg p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" aria-hidden />
        {children}
      </div>
    </div>
  );
}
```
```tsx
// src/components/Toast.tsx
import { useEffect, useState } from 'react';
import { createEmitter } from '../lib/emitter';

type Kind = 'success' | 'error' | 'info';
interface ToastMsg { id: number; message: string; kind: Kind }
const bus = createEmitter<ToastMsg>();
let seq = 0;
export const toast = (message: string, kind: Kind = 'info') => bus.emit({ id: ++seq, message, kind });

export function Toaster() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => bus.on((m) => {
    setItems((x) => [...x.slice(-2), m]);
    window.setTimeout(() => setItems((x) => x.filter((i) => i.id !== m.id)), 3500);
  }), []);
  const color = { success: 'bg-accent text-accent-fg', error: 'bg-danger text-white', info: 'bg-fg text-bg' };
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-50 flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
      {items.map((m) => (
        <div key={m.id} className={`rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg ${color[m.kind]}`}>{m.message}</div>
      ))}
    </div>
  );
}
```
```tsx
// src/components/PendingBadge.tsx
import { queue } from '../data/productRepo';
import { useQueueItems } from '../features/shared/hooks';
import { t } from '../lib/i18n';

export function PendingBadge() {
  const n = queue.visibleCount(useQueueItems());
  if (!n) return null;
  return <span className="rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-black">{t('badge.pending', { n })}</span>;
}
```
```tsx
// src/components/TabBar.tsx
import type { ReactElement } from 'react';
import { t, type MessageKey } from '../lib/i18n';

export type Tab = 'scan' | 'products' | 'account';
const icon = (d: string) => (
  <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);
const TABS: { id: Tab; label: MessageKey; icon: ReactElement }[] = [
  { id: 'scan', label: 'tab.scan', icon: icon('M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10') },
  { id: 'products', label: 'tab.products', icon: icon('M4 6h16M4 12h16M4 18h16') },
  { id: 'account', label: 'tab.account', icon: icon('M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z') },
];

export function TabBar({ tab, onChange }: { tab: Tab; onChange(t: Tab): void }) {
  return (
    <nav className="grid grid-cols-3 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]" aria-label="Main">
      {TABS.map((x) => (
        <button
          key={x.id} onClick={() => onChange(x.id)} aria-current={tab === x.id ? 'page' : undefined}
          className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-accent ${tab === x.id ? 'text-accent' : 'text-muted'}`}
        >
          {x.icon}{t(x.label)}
        </button>
      ))}
    </nav>
  );
}
```

- [ ] **Step 5: Write `src/App.tsx`**

```tsx
import { lazy, Suspense, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { LoginScreen } from './auth/LoginScreen';
import { TabBar, type Tab } from './components/TabBar';
import { PendingBadge } from './components/PendingBadge';
import { Toaster, toast } from './components/Toast';
import { ScanScreen } from './features/scan/ScanScreen';
import { startAutoSync } from './data/autoSync';
import { queue } from './data/productRepo';
import { getDetector } from './scanner/detector';
import { env } from './lib/env';
import { t } from './lib/i18n';

const ProductsScreen = lazy(() => import('./features/products/ProductsScreen').then((m) => ({ default: m.ProductsScreen })));
const AccountScreen = lazy(() => import('./features/account/AccountScreen').then((m) => ({ default: m.AccountScreen })));

function Shell() {
  const [tab, setTab] = useState<Tab>('scan');
  useEffect(() => {
    const stop = startAutoSync();
    const off = queue.onNotice((n) => toast(t(n.key, n.params), 'error'));
    void getDetector().catch(() => { /* scanner shows its own error */ }); // warm the scanner in the background
    return () => { stop(); off(); };
  }, []);
  return (
    <div className="mx-auto flex h-full max-w-xl flex-col">
      <header className="flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h1 className="text-lg font-bold">{t('app.name')}</h1>
        <PendingBadge />
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Suspense fallback={null}>
          {tab === 'scan' && <ScanScreen />}
          {tab === 'products' && <ProductsScreen />}
          {tab === 'account' && <AccountScreen />}
        </Suspense>
      </main>
      <TabBar tab={tab} onChange={setTab} />
      <Toaster />
    </div>
  );
}

function Gate() {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid h-full place-items-center text-muted">…</div>;
  return user ? <Shell /> : <LoginScreen />;
}

export default function App() {
  if (!env.configured) return <p className="p-6 font-medium text-danger">{t('config.missing')}</p>;
  return <AuthProvider><Gate /><Toaster /></AuthProvider>;
}
```
The single `<Toaster />` lives in `App` (so login-screen toasts work too); the `Shell` above must NOT render its own: delete the `<Toaster />` line from `Shell`'s JSX.

- [ ] **Step 6: Checkpoint**

Typecheck will fail until Tasks 9-11 create `ScanScreen`, `detector`, `feedback`, `ProductsScreen`, `AccountScreen`. Do not run `tsc` here; proceed to Task 9.

---

### Task 9: Scanner module

**Files:**
- Create: `src/scanner/{detector,feedback,keyBuffer,useBarcodeScanner,useKeyboardScanner}.ts(x)`, `src/features/scan/ScannerView.tsx`
- Test: `src/scanner/keyBuffer.test.ts`

**Interfaces:**
- Produces:
  - `SCAN_FORMATS`, `getDetector(): Promise<{ detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> }>` (module-cached; native BarcodeDetector if present and supporting formats, else lazily imported ZXing ponyfill)
  - `beep()`, `vibrate()`, `primeAudio()`, `warmCameraPermission(): Promise<void>`
  - `createKeyBuffer(onCode: (code: string) => void, gapMs?: number): { push(key: string, now: number): void }`
  - `useKeyboardScanner(onCode: (code: string) => void, enabled: boolean): void`
  - `useBarcodeScanner({ onDetect, enabled, confirmReads? })` returns `{ videoRef, status: 'starting' | 'running' | 'denied' | 'error', torchSupported, torchOn, canSwitch, toggleTorch(), switchCamera(), focusAt(x: number, y: number), restart() }`
  - `<ScannerView enabled: boolean; onDetect(code: string): void />`

- [ ] **Step 1: Write failing test `src/scanner/keyBuffer.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createKeyBuffer } from './keyBuffer';

function type(buf: ReturnType<typeof createKeyBuffer>, s: string, start: number, step: number) {
  let t = start;
  for (const ch of s) { buf.push(ch, t); t += step; }
  return t;
}

describe('createKeyBuffer', () => {
  it('emits a code when Enter follows fast keystrokes', () => {
    const on = vi.fn();
    const b = createKeyBuffer(on, 100);
    const t = type(b, '8901234', 0, 20);
    b.push('Enter', t);
    expect(on).toHaveBeenCalledWith('8901234');
  });
  it('ignores slow human typing', () => {
    const on = vi.fn();
    const b = createKeyBuffer(on, 100);
    const t = type(b, '8901234', 0, 400);
    b.push('Enter', t);
    expect(on).not.toHaveBeenCalled();
  });
  it('ignores short bursts and modifier keys', () => {
    const on = vi.fn();
    const b = createKeyBuffer(on, 100);
    b.push('a', 0); b.push('Shift', 10); b.push('Enter', 20);
    expect(on).not.toHaveBeenCalled();
  });
  it('clears the buffer after emitting', () => {
    const on = vi.fn();
    const b = createKeyBuffer(on, 100);
    let t = type(b, '1234', 0, 10); b.push('Enter', t); b.push('Enter', t + 10);
    expect(on).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `npx vitest run src/scanner`

- [ ] **Step 3: Implement keyBuffer and the keyboard hook**

```ts
// src/scanner/keyBuffer.ts
/** Keyboard-wedge scanners type digits very fast then press Enter. Slow typing resets the buffer. */
export function createKeyBuffer(onCode: (code: string) => void, gapMs = 100) {
  let buf = '';
  let last = 0;
  return {
    push(key: string, now: number) {
      if (key === 'Enter') {
        const code = buf; buf = '';
        if (code.length >= 4) onCode(code);
        return;
      }
      if (key.length !== 1) return;
      if (now - last > gapMs) buf = '';
      buf += key; last = now;
    },
  };
}
```
```ts
// src/scanner/useKeyboardScanner.ts
import { useEffect } from 'react';
import { createKeyBuffer } from './keyBuffer';

const TYPING = /^(INPUT|TEXTAREA|SELECT)$/;

/** USB/Bluetooth barcode scanners that act like a keyboard. Ignored while a form field has focus. */
export function useKeyboardScanner(onCode: (code: string) => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const buffer = createKeyBuffer(onCode, 100);
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (TYPING.test(el.tagName) || el.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      buffer.push(e.key, performance.now());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCode, enabled]);
}
```

- [ ] **Step 4: Implement feedback, detector**

```ts
// src/scanner/feedback.ts
let ctx: AudioContext | null = null;

/** Call from a user gesture once (iOS blocks audio until then). */
export function primeAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { /* no audio */ }
}
export function beep() {
  try {
    if (!ctx) return;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'square'; o.frequency.value = 1100; g.gain.value = 0.08;
    o.connect(g).connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.09);
  } catch { /* ignore */ }
}
export const vibrate = () => { try { navigator.vibrate?.(60); } catch { /* unsupported */ } };

/** Ask for camera access right after login so the first scan is instant; the stream is released at once. */
export async function warmCameraPermission(): Promise<void> {
  try {
    if (!navigator.mediaDevices?.getUserMedia) return;
    const status = await navigator.permissions?.query({ name: 'camera' as PermissionName });
    if (status && status.state !== 'prompt') return;
    const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
    s.getTracks().forEach((t) => t.stop());
  } catch { /* denied or unsupported: the scanner screen handles it */ }
}
```
```ts
// src/scanner/detector.ts
export const SCAN_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'] as const;

export interface Detector { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> }
type Ctor = new (opts: { formats: string[] }) => Detector & object;

let cached: Promise<Detector> | null = null;

/** Native BarcodeDetector when it supports our formats, otherwise the ZXing WASM ponyfill (lazy chunk). */
export function getDetector(): Promise<Detector> {
  return (cached ??= create().catch((e) => { cached = null; throw e; }));
}

async function create(): Promise<Detector> {
  const Native = (globalThis as { BarcodeDetector?: Ctor & { getSupportedFormats(): Promise<string[]> } }).BarcodeDetector;
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats();
      const formats = SCAN_FORMATS.filter((f) => supported.includes(f));
      if (formats.length === SCAN_FORMATS.length) return new Native({ formats: [...formats] });
    } catch { /* fall through to the polyfill */ }
  }
  const { BarcodeDetector } = await import('./zxing');
  return new BarcodeDetector({ formats: [...SCAN_FORMATS] }) as unknown as Detector;
}
```

- [ ] **Step 5: Implement `src/scanner/zxing.ts` (self-hosted WASM so it works offline)**

First open `node_modules/barcode-detector/README.md` and `node_modules/zxing-wasm/README.md` and confirm the current names of: the ponyfill entry (`barcode-detector/ponyfill` vs `barcode-detector/pure`), and the function used to point the WASM at a local URL (`prepareZXingModule({ overrides: { locateFile } })` or `setZXingModuleOverrides`). Use the names the installed version documents. Expected shape:

```ts
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill';

// Serve the WASM from our own origin (bundled and precached) instead of the default CDN.
prepareZXingModule({
  overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
  fireImmediately: true,
});

export { BarcodeDetector };
```
If `zxing-wasm` is not a direct dependency, run `npm i zxing-wasm` so the `?url` import resolves. Add `declare module '*.wasm?url' { const url: string; export default url; }` to `src/vite-env.d.ts` if tsc cannot resolve it.

- [ ] **Step 6: Implement `src/scanner/useBarcodeScanner.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { getDetector } from './detector';
import { beep, vibrate } from './feedback';

interface Options { onDetect(code: string): void; enabled: boolean; confirmReads?: number }
type Status = 'starting' | 'running' | 'denied' | 'error';
type TrackCaps = MediaTrackCapabilities & { torch?: boolean };

const VIDEO = { width: { ideal: 1280 }, height: { ideal: 720 } };

export function useBarcodeScanner({ onDetect, enabled, confirmReads = 2 }: Options) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const devicesRef = useRef<string[]>([]);
  const indexRef = useRef(0);
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;
  const [status, setStatus] = useState<Status>('starting');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [canSwitch, setCanSwitch] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async (deviceId?: string) => {
    stop();
    setStatus('starting'); setTorchOn(false);
    try {
      const video: MediaTrackConstraints = deviceId
        ? { deviceId: { exact: deviceId }, ...VIDEO }
        : { facingMode: { ideal: 'environment' }, ...VIDEO };
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
      streamRef.current = stream;
      const el = videoRef.current;
      if (!el) { stop(); return; }
      el.srcObject = stream;
      await el.play();
      const track = stream.getVideoTracks()[0];
      setTorchSupported(Boolean((track.getCapabilities?.() as TrackCaps | undefined)?.torch));
      const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
      devicesRef.current = cams.map((d) => d.deviceId);
      indexRef.current = Math.max(0, devicesRef.current.indexOf(track.getSettings().deviceId ?? ''));
      setCanSwitch(cams.length > 1);
      setStatus('running');
    } catch (e) {
      const name = (e as DOMException).name;
      setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error');
    }
  }, [stop]);

  useEffect(() => {
    void start();
    void getDetector().catch(() => { /* surfaced when scanning starts */ }); // load WASM while the camera warms up
    return stop;
  }, [start, stop]);

  // Continuous scan loop: one detect() in flight at a time, frames are skipped while busy.
  useEffect(() => {
    if (!enabled || status !== 'running') return;
    let raf = 0; let busy = false; let done = false;
    let last: string | null = null; let reads = 0;
    const tick = async () => {
      if (done) return;
      const video = videoRef.current;
      if (!busy && video && video.readyState >= 2) {
        busy = true;
        try {
          const found = (await (await getDetector()).detect(video))[0]?.rawValue?.trim();
          if (found) {
            reads = found === last ? reads + 1 : 1;
            last = found;
            if (reads >= confirmReads) {
              done = true;
              vibrate(); beep();
              onDetectRef.current(found);
              return;
            }
          }
        } catch { /* a bad frame is not fatal */ } finally { busy = false; }
      }
      raf = requestAnimationFrame(() => void tick());
    };
    raf = requestAnimationFrame(() => void tick());
    return () => { done = true; cancelAnimationFrame(raf); };
  }, [enabled, status, confirmReads]);

  const applyAdvanced = async (c: Record<string, unknown>) => {
    const track = streamRef.current?.getVideoTracks()[0];
    await track?.applyConstraints({ advanced: [c as MediaTrackConstraintSet] });
  };
  const toggleTorch = useCallback(async () => {
    try { await applyAdvanced({ torch: !torchOn }); setTorchOn((v) => !v); } catch { /* unsupported */ }
  }, [torchOn]);
  const switchCamera = useCallback(() => {
    const ids = devicesRef.current;
    if (ids.length < 2) return;
    indexRef.current = (indexRef.current + 1) % ids.length;
    void start(ids[indexRef.current]);
  }, [start]);
  const focusAt = useCallback((x: number, y: number) => {
    void applyAdvanced({ focusMode: 'single-shot', pointsOfInterest: [{ x, y }] }).catch(() => { /* not supported */ });
  }, []);

  return { videoRef, status, torchSupported, torchOn, canSwitch, toggleTorch, switchCamera, focusAt, restart: () => void start() };
}
```
Note: scanning is paused by passing `enabled=false`; the stream stays open so resuming is instant.

- [ ] **Step 7: Implement `src/features/scan/ScannerView.tsx`**

```tsx
import type { MouseEvent } from 'react';
import { useBarcodeScanner } from '../../scanner/useBarcodeScanner';
import { t } from '../../lib/i18n';

export function ScannerView({ enabled, onDetect }: { enabled: boolean; onDetect(code: string): void }) {
  const s = useBarcodeScanner({ enabled, onDetect });

  function tapFocus(e: MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    s.focusAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  }

  const failed = s.status === 'denied' || s.status === 'error';
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden bg-black sm:rounded-3xl" onClick={tapFocus}>
      <video ref={s.videoRef} className="size-full object-cover" playsInline muted aria-label="Camera preview" />
      {!failed && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="h-1/2 w-4/5 rounded-3xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          <p className="absolute bottom-3 text-sm font-medium text-white drop-shadow">{t('scan.hint')}</p>
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface p-6 text-center">
          <p className="font-medium">{t(s.status === 'denied' ? 'scan.camera.denied' : 'scan.camera.error')}</p>
          <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); s.restart(); }}>{t('scan.retryCamera')}</button>
        </div>
      )}
      <div className="absolute right-3 top-3 flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
        {s.torchSupported && (
          <button className="grid size-12 place-items-center rounded-full bg-black/55 text-xl text-white focus-visible:outline-2 focus-visible:outline-white" aria-pressed={s.torchOn} aria-label={t('scan.torch')} onClick={() => void s.toggleTorch()}>
            {s.torchOn ? '🔦' : '💡'}
          </button>
        )}
        {s.canSwitch && (
          <button className="grid size-12 place-items-center rounded-full bg-black/55 text-xl text-white focus-visible:outline-2 focus-visible:outline-white" aria-label={t('scan.switch')} onClick={s.switchCamera}>🔄</button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run tests**

Run: `npx vitest run src/scanner`  Expected: PASS (key buffer). Full typecheck still waits for Tasks 10-11.

---

### Task 10: Scan screen, product details and product form

**Files:**
- Create: `src/components/ProductDetails.tsx`, `src/features/scan/{ScanScreen,ManualEntry,ProductSheet}.tsx`

**Interfaces:**
- Consumes: repo `lookup/save/update/distinctCompanies/addedTodayCount`, `validateForm`, `errorKey/mapError`, `useAuth`, `useProducts`, `BottomSheet`, `toast`, `ScannerView`, `useKeyboardScanner`, `primeAudio`.
- Produces: `<ProductDetails product onEdit?(): void />`; `<ProductSheet mode barcode initial? offline? onClose onSaved(name: string) />`; `<ScanScreen />`.

- [ ] **Step 1: Write `src/components/ProductDetails.tsx`**

```tsx
import type { Product } from '../data/types';
import { formatDhaka, formatPrice } from '../lib/format';
import { t } from '../lib/i18n';

export function ProductDetails({ product: p, showAlready, onEdit }: { product: Product; showAlready?: boolean; onEdit?: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      {showAlready && (
        <p role="alert" className="rounded-2xl bg-amber-100 px-4 py-3 font-semibold text-amber-950">{t('product.already')}</p>
      )}
      <div className="card">
        <h2 className="text-xl font-bold">{p.name}</h2>
        <p className="text-muted">{p.company}</p>
        <p className="mt-2 text-2xl font-bold text-accent">৳ {formatPrice(p.selling_price)} <span className="text-base font-medium text-muted">/ {p.unit}</span></p>
        <dl className="mt-3 grid gap-1 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-muted">{t('product.barcode')}</dt><dd className="font-mono">{p.barcode}</dd></div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">{t('product.addedByLabel')}</dt>
            <dd className="text-right">{p.added_by_email ?? t('product.unknownUser')} · {formatDhaka(p.created_at)}</dd>
          </div>
        </dl>
        {p.pending && <p className="mt-3 text-sm font-medium text-amber-600">{t('product.syncing')}</p>}
      </div>
      {onEdit && !p.pending && <button className="btn btn-secondary" onClick={onEdit}>{t('product.edit')}</button>}
    </div>
  );
}
```
In `src/lib/i18n/en.ts` (Task 3), replace the `'product.addedBy'` entry with `'product.addedByLabel': 'Added by',`.

- [ ] **Step 2: Write `src/features/scan/ProductSheet.tsx`**

```tsx
import { useMemo, useState, type FormEvent } from 'react';
import { BottomSheet } from '../../components/BottomSheet';
import { useAuth } from '../../auth/AuthProvider';
import { useProducts } from '../shared/hooks';
import { distinctCompanies, save, update } from '../../data/productRepo';
import { errorKey, mapError } from '../../data/errors';
import { UNITS, type Product, type Unit } from '../../data/types';
import { validateForm, type FieldErrors } from '../../lib/validate';
import { t } from '../../lib/i18n';

interface Props {
  mode: 'create' | 'edit';
  barcode: string;
  initial?: Product;
  offline?: boolean;
  onClose(): void;
  onSaved(name: string): void;
}

export function ProductSheet({ mode, barcode, initial, offline, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const products = useProducts();
  const companies = useMemo(() => distinctCompanies(products), [products]);
  const [name, setName] = useState(initial?.name ?? '');
  const [unit, setUnit] = useState<Unit>(initial?.unit ?? 'pcs');
  const [price, setPrice] = useState(initial ? String(initial.selling_price) : '');
  const [company, setCompany] = useState(initial?.company ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Snap to an existing spelling ("pran " -> "Pran") to avoid company name variants.
  const snapCompany = () => {
    const hit = companies.find((c) => c.toLowerCase() === company.trim().toLowerCase());
    if (hit) setCompany(hit);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !user) return;
    const v = validateForm({ barcode, name, unit, price, company });
    if (!v.ok) { setErrors(v.errors); return; }
    setErrors({}); setFormError(null); setBusy(true);
    try {
      if (mode === 'create') {
        const r = await save(v.value, user);
        if (r.status === 'duplicate-product') { setFormError(t('err.duplicateProduct')); setBusy(false); return; }
        if (r.status === 'duplicate-pending') { setFormError(t('save.queuedDuplicate')); setBusy(false); return; }
      } else {
        const { name: n, unit: u, selling_price, company: c } = v.value;
        await update(initial!.id, { name: n, unit: u, selling_price, company: c });
      }
      onSaved(v.value.name);
    } catch (err) {
      setFormError(t(errorKey(mapError(err).kind)));
      setBusy(false);
    }
  }

  const field = (id: string, label: string, error?: string, children?: React.ReactNode) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {children}
      {error && <p id={`${id}-err`} className="text-sm font-medium text-danger">{error}</p>}
    </div>
  );
  const bad = (k: keyof FieldErrors) => (errors[k] ? { 'aria-invalid': true, 'aria-describedby': `${k}-err` } : {});

  return (
    <BottomSheet title={t(mode === 'create' ? 'form.new.title' : 'form.edit.title')} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <h2 className="text-xl font-bold">{t(mode === 'create' ? 'form.new.title' : 'form.edit.title')}</h2>
        {offline && <p className="rounded-2xl bg-amber-100 px-4 py-3 text-sm font-medium text-amber-950">{t('scan.offlineNew')}</p>}
        {field('barcode', t('form.barcode'), undefined,
          <input id="barcode" className="input font-mono" value={barcode} readOnly />)}
        {field('name', t('form.name'), errors.name && t(errors.name),
          <input id="name" className="input" autoFocus autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} {...bad('name')} />)}
        <div className="grid grid-cols-2 gap-3">
          {field('unit', t('form.unit'), errors.unit && t(errors.unit),
            <select id="unit" className="input" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
              {UNITS.map((u) => <option key={u} value={u}>{t(`unit.${u}`)}</option>)}
            </select>)}
          {field('price', t('form.price'), errors.price && t(errors.price),
            <input id="price" className="input" inputMode="decimal" autoComplete="off" placeholder="0.00" value={price} onChange={(e) => setPrice(e.target.value)} {...bad('price')} />)}
        </div>
        {field('company', t('form.company'), errors.company && t(errors.company),
          <>
            <input id="company" className="input" list="companies" autoComplete="off" value={company}
              onChange={(e) => setCompany(e.target.value)} onBlur={snapCompany} {...bad('company')} />
            <datalist id="companies">{companies.map((c) => <option key={c} value={c} />)}</datalist>
          </>)}
        {formError && <p role="alert" className="rounded-2xl bg-red-100 px-4 py-3 text-sm font-semibold text-red-900">{formError}</p>}
        <div className="grid grid-cols-[1fr_2fr] gap-3">
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t('form.cancel')}</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? t('form.saving') : t('form.save')}</button>
        </div>
      </form>
    </BottomSheet>
  );
}
```
Also `import type { ReactNode } from 'react'` and use `ReactNode` instead of `React.ReactNode` in the `field` helper.

- [ ] **Step 3: Write `src/features/scan/ManualEntry.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { t } from '../../lib/i18n';

export function ManualEntry({ onSubmit, disabled }: { onSubmit(code: string): void; disabled?: boolean }) {
  const [value, setValue] = useState('');
  function submit(e: FormEvent) {
    e.preventDefault();
    const code = value.trim();
    if (!code || disabled) return;
    setValue('');
    onSubmit(code);
  }
  return (
    <form onSubmit={submit} className="flex gap-2">
      <label className="sr-only" htmlFor="manual-barcode">{t('scan.manual.label')}</label>
      <input id="manual-barcode" className="input flex-1" inputMode="numeric" autoComplete="off" enterKeyHint="search"
        placeholder={t('scan.manual.label')} value={value} onChange={(e) => setValue(e.target.value)} />
      <button className="btn btn-primary" disabled={disabled}>{t('scan.manual.submit')}</button>
    </form>
  );
}
```
(A hardware scanner typing into this field ends with Enter, which submits the form: that covers keyboard-wedge scanning while the field is focused.)

- [ ] **Step 4: Write `src/features/scan/ScanScreen.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { BottomSheet } from '../../components/BottomSheet';
import { ProductDetails } from '../../components/ProductDetails';
import { toast } from '../../components/Toast';
import { addedTodayCount, lookup } from '../../data/productRepo';
import { errorKey, mapError } from '../../data/errors';
import type { Product } from '../../data/types';
import { normalizeBarcode } from '../../lib/barcode';
import { t } from '../../lib/i18n';
import { primeAudio } from '../../scanner/feedback';
import { useKeyboardScanner } from '../../scanner/useKeyboardScanner';
import { useProducts } from '../shared/hooks';
import { ManualEntry } from './ManualEntry';
import { ProductSheet } from './ProductSheet';
import { ScannerView } from './ScannerView';

type View =
  | { kind: 'scan' }
  | { kind: 'busy'; code: string }
  | { kind: 'existing'; product: Product }
  | { kind: 'new'; code: string; offline: boolean }
  | { kind: 'edit'; product: Product };

export function ScanScreen() {
  const { user, isOwner } = useAuth();
  const products = useProducts();
  const [view, setView] = useState<View>({ kind: 'scan' });
  const scanning = view.kind === 'scan';

  useEffect(() => {
    const prime = () => primeAudio();
    window.addEventListener('pointerdown', prime, { once: true });
    return () => window.removeEventListener('pointerdown', prime);
  }, []);

  const handleCode = useCallback(async (raw: string) => {
    const code = normalizeBarcode(raw);
    if (!code) return;
    setView({ kind: 'busy', code });
    try {
      const r = await lookup(code);
      setView(r.product ? { kind: 'existing', product: r.product } : { kind: 'new', code, offline: r.offline });
    } catch (e) {
      toast(t(errorKey(mapError(e).kind)), 'error');
      setView({ kind: 'scan' });
    }
  }, []);

  useKeyboardScanner(handleCode, scanning);
  const resume = useCallback(() => setView({ kind: 'scan' }), []);
  const saved = (name: string) => { toast(t('save.success', { name }), 'success'); resume(); };

  return (
    <div className="flex flex-col gap-3 pb-4">
      <ScannerView enabled={scanning} onDetect={handleCode} />
      <div className="flex flex-col gap-3 px-4">
        <p className="text-sm font-semibold text-muted" aria-live="polite">
          {view.kind === 'busy' ? t('scan.looking', { code: view.code }) : t('scan.addedToday', { n: user ? addedTodayCount(products, user.id) : 0 })}
        </p>
        <ManualEntry onSubmit={handleCode} disabled={!scanning} />
      </div>

      {view.kind === 'existing' && (
        <BottomSheet title={t('product.already')} onClose={resume}>
          <ProductDetails product={view.product} showAlready onEdit={isOwner ? () => setView({ kind: 'edit', product: view.product }) : undefined} />
          <button className="btn btn-primary mt-3 w-full" onClick={resume}>{t('product.close')}</button>
        </BottomSheet>
      )}
      {view.kind === 'new' && <ProductSheet mode="create" barcode={view.code} offline={view.offline} onClose={resume} onSaved={saved} />}
      {view.kind === 'edit' && <ProductSheet mode="edit" barcode={view.product.barcode} initial={view.product} onClose={resume} onSaved={saved} />}
    </div>
  );
}
```

- [ ] **Step 5: Checkpoint**

Typecheck waits for Task 11. Proceed.

---

### Task 11: Products and Account screens

**Files:**
- Create: `src/features/products/ProductsScreen.tsx`, `src/features/account/AccountScreen.tsx`

**Interfaces:**
- Consumes: `useProducts`, `useQueueItems`, `searchProducts`, `ProductDetails`, `ProductSheet`, `queue`, `sync`, `fetchAllForExport`, `buildCsv`, `useAuth`.

- [ ] **Step 1: Write `ProductsScreen.tsx`**

```tsx
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { BottomSheet } from '../../components/BottomSheet';
import { ProductDetails } from '../../components/ProductDetails';
import { toast } from '../../components/Toast';
import { searchProducts } from '../../data/productRepo';
import type { Product } from '../../data/types';
import { formatPrice } from '../../lib/format';
import { t } from '../../lib/i18n';
import { ProductSheet } from '../scan/ProductSheet';
import { useProducts } from '../shared/hooks';

const STEP = 40;

export function ProductsScreen() {
  const { isOwner } = useAuth();
  const all = useProducts();
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const results = useMemo(() => searchProducts(all, deferred), [all, deferred]);
  const [shown, setShown] = useState(STEP);
  const [open, setOpen] = useState<Product | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const sentinel = useRef<HTMLLIElement>(null);

  useEffect(() => setShown(STEP), [deferred]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) setShown((n) => n + STEP); }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [results.length, shown]);

  return (
    <div className="flex flex-col gap-3 px-4 pb-4">
      <div className="sticky top-0 z-10 -mx-4 bg-bg px-4 pb-2 pt-1">
        <label className="sr-only" htmlFor="search">{t('products.search')}</label>
        <input id="search" type="search" className="input" placeholder={t('products.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <p className="mt-1 text-xs text-muted">{t('products.count', { n: results.length })}</p>
      </div>
      {results.length === 0 && <p className="py-10 text-center text-muted">{t('products.empty')}</p>}
      <ul className="flex flex-col gap-2">
        {results.slice(0, shown).map((p) => (
          <li key={p.barcode}>
            <button className="card flex min-h-14 w-full items-center justify-between gap-3 text-left focus-visible:outline-2 focus-visible:outline-accent" onClick={() => setOpen(p)}>
              <span className="min-w-0">
                <span className="block truncate font-semibold">{p.name}</span>
                <span className="block truncate text-sm text-muted">{p.company} · <span className="font-mono">{p.barcode}</span></span>
              </span>
              <span className="shrink-0 font-bold text-accent">৳ {formatPrice(p.selling_price)}</span>
            </button>
          </li>
        ))}
        <li ref={sentinel} aria-hidden />
      </ul>
      {open && !editing && (
        <BottomSheet title={open.name} onClose={() => setOpen(null)}>
          <ProductDetails product={open} onEdit={isOwner ? () => setEditing(open) : undefined} />
          <button className="btn btn-primary mt-3 w-full" onClick={() => setOpen(null)}>{t('product.close')}</button>
        </BottomSheet>
      )}
      {editing && (
        <ProductSheet mode="edit" barcode={editing.barcode} initial={editing} onClose={() => setEditing(null)}
          onSaved={(name) => { toast(t('save.success', { name }), 'success'); setEditing(null); setOpen(null); }} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write `AccountScreen.tsx`**

```tsx
import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { toast } from '../../components/Toast';
import { fetchAllForExport, queue, sync } from '../../data/productRepo';
import { errorKey, mapError } from '../../data/errors';
import { buildCsv } from '../../lib/csv';
import { dhakaDayKey } from '../../lib/format';
import { t } from '../../lib/i18n';
import { useQueueItems } from '../shared/hooks';

export function AccountScreen() {
  const { user, isOwner, signOut } = useAuth();
  const items = useQueueItems();
  const pending = items.length;
  const attention = items.filter((i) => i.status === 'attention');
  const [exporting, setExporting] = useState(false);

  async function exportCsv() {
    setExporting(true);
    try {
      const csv = buildCsv(await fetchAllForExport());
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = `products-${dhakaDayKey(new Date())}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { toast(t(errorKey(mapError(e).kind)), 'error'); }
    setExporting(false);
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-6 pt-2">
      <h2 className="text-xl font-bold">{t('account.title')}</h2>
      <div className="card">
        <p className="font-semibold">{t('account.signedInAs', { email: user?.email ?? '' })}</p>
        <p className="text-sm text-muted">{t(isOwner ? 'account.role.owner' : 'account.role.employee')}</p>
      </div>

      <div className="card flex flex-col gap-3">
        <p className="font-semibold">{pending ? t('account.pending', { n: pending }) : t('account.allSynced')}</p>
        <button className="btn btn-secondary" onClick={() => { void queue.flush(); void sync(); }}>{t('account.syncNow')}</button>
      </div>

      {attention.length > 0 && (
        <div className="card flex flex-col gap-3" role="alert">
          <p className="font-semibold text-danger">{t('account.attention')}</p>
          {attention.map((i) => (
            <div key={i.id} className="flex flex-col gap-2 border-t border-line pt-3">
              <p><span className="font-semibold">{i.product.name}</span> <span className="font-mono text-sm text-muted">{i.product.barcode}</span></p>
              <p className="text-sm text-muted">{i.error}</p>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn btn-secondary" onClick={() => void queue.retry(i.id)}>{t('account.retry')}</button>
                <button className="btn btn-secondary" onClick={() => void queue.discard(i.id)}>{t('account.discard')}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {isOwner && (
        <button className="btn btn-secondary" disabled={exporting} onClick={() => void exportCsv()}>
          {exporting ? t('account.exporting') : t('account.export')}
        </button>
      )}

      <button className="btn btn-primary" disabled={pending > 0} onClick={() => void signOut()}>{t('account.signOut')}</button>
      {pending > 0 && <p className="text-sm text-muted">{t('account.signOutBlocked')}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck, fix every error, run tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS. Fix type errors in Tasks 8-11 code now (e.g. the `product.addedBy` key removal, `React.ReactNode` import in `ProductSheet`, the `_b` destructure). Then run `npm run dev` and confirm the login screen renders at a phone-sized viewport.

---

### Task 12: PWA (installability and offline shell)

**Files:**
- Create: `pwa-assets.config.ts`, `public/icon.svg`
- Modify: `vite.config.ts`

- [ ] **Step 1: Write `public/icon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#15803d"/><g fill="#fff"><rect x="120" y="150" width="28" height="212"/><rect x="170" y="150" width="14" height="212"/><rect x="206" y="150" width="42" height="212"/><rect x="270" y="150" width="14" height="212"/><rect x="306" y="150" width="28" height="212"/><rect x="356" y="150" width="36" height="212"/></g></svg>
```

- [ ] **Step 2: Write `pwa-assets.config.ts` and generate icons**

```ts
import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({ preset: minimal2023Preset, images: ['public/icon.svg'] });
```
Run: `npm run icons`
Expected: `public/pwa-64x64.png`, `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png`, `favicon.ico` created.

- [ ] **Step 3: Add the plugin to `vite.config.ts`**

```ts
import { VitePWA } from 'vite-plugin-pwa';
// inside plugins: [react(), tailwindcss(), VitePWA({...})]
VitePWA({
  registerType: 'autoUpdate',
  includeAssets: ['icon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
  manifest: {
    name: 'Shop Product Entry',
    short_name: 'Product Entry',
    description: 'Scan barcodes and add shop products fast.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#15803d',
    background_color: '#ffffff',
    icons: [
      { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    // App shell + the self-hosted ZXing WASM, so scanning works offline. Supabase calls are never cached.
    globPatterns: ['**/*.{js,css,html,svg,png,ico,wasm}'],
    maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
    navigateFallback: '/index.html',
    runtimeCaching: [],
  },
}),
```

- [ ] **Step 4: Build and inspect**

Run: `npm run build`
Expected: PASS; output lists `manifest.webmanifest`, `sw.js`, and a `.wasm` file under `dist/assets`. Check the main JS chunk is small and that the ZXing code is a separate lazy chunk (`ls -la dist/assets`). Confirm `grep -c supabase dist/sw.js` is 0 (no Supabase URLs in the service worker).

---

### Task 13: README and final verification

**Files:** Create `README.md`.

- [ ] **Step 1: Write `README.md` with these sections (full prose and commands)**

1. **What it is** (2 lines).
2. **Supabase setup:**
   1. Create a project. In the SQL editor, paste and run `supabase/schema.sql`.
   2. Authentication → Sign In / Providers → turn **off** "Allow new users to sign up" (there is no sign-up page).
   3. Authentication → Users → Add user (email + password, tick Auto Confirm) for each employee.
   4. Make yourself owner: run `update public.profiles set role = 'owner' where id = (select id from auth.users where email = 'you@example.com');`
   5. Project Settings → API: copy the Project URL and the anon/publishable key.
3. **Run locally:** `cp .env.example .env.local`, fill the two `VITE_` values, `npm install`, `npm run dev`. Note: the camera needs HTTPS; `localhost` counts as secure, but on a phone use the deployed HTTPS URL (or a tunnel such as `cloudflared`).
4. **Tests:** `npm test`; `npm run test:integration` needs the four `TEST_*` vars (use a dev project; rows are prefixed `TEST-` and cleaned up).
5. **Deploy:** Vercel (Framework Vite, build `npm run build`, output `dist`, env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`); Cloudflare Pages (build `npm run build`, output `dist`, same env vars). Both give HTTPS.
6. **Install on a phone:** Android Chrome: open the site, menu → "Install app" / "Add to Home screen". iPhone Safari: Share → "Add to Home Screen". The camera permission is asked on first login.
7. **Using it:** scanning flow, offline behavior ("Pending sync" badge, auto retry), owner features (Edit, Export CSV), keyboard-wedge scanners.
8. **Adding Bengali later:** copy `src/lib/i18n/en.ts` to `bn.ts` with translated values and pick it in `src/lib/i18n/index.ts`.
9. **Project layout** (the file tree from this plan).

- [ ] **Step 2: Run the full verification suite**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: all PASS. Do not claim completion without the output.

- [ ] **Step 3: Integration test against the real project (only if the user has applied the schema and supplied test users)**

Add the four `TEST_*` values to `.env.local`, then run `npm run test:integration`.
Expected: all tests PASS (anon denied, duplicate barcode incl. whitespace, duplicate name+company+unit, price/unit checks, forged `created_by`, employee cannot update/delete, owner can). If the user has not done this yet, report plainly that the DB-level duplicate/RLS tests were written but NOT run, and what they need to do.

- [ ] **Step 4: Smoke-test the UI in a browser**

Run `npm run preview`, open the URL at a phone-size viewport with Claude in Chrome (or ask the user to open it on their phone over HTTPS). Check: login screen renders, wrong password shows the error, after login the tabs work, dark mode follows the system, DevTools → Application shows the manifest and an active service worker, and toggling Network → Offline then reloading still loads the app shell. Camera scanning itself needs a real device: list this as "not verified here" in the final report unless tested on a phone.

- [ ] **Step 5: Final report**

State what was verified (with the commands run) and what was not (real-device camera scanning, install on iPhone/Android, integration tests if skipped).
