-- Shop Product Entry schema. Run once in the Supabase SQL editor (safe to re-run).
--
-- HOW TO MAKE YOURSELF THE OWNER (run after creating your user in Authentication -> Users):
--
--   update public.profiles set role = 'owner'
--   where id = (select id from auth.users where email = 'you@example.com');
--
-- Alternative: put {"role": "owner"} in the user's *app_metadata* (never user_metadata,
-- which users can edit themselves). To demote: set role = 'employee'.

-- ---------- profiles (roles) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'employee' check (role in ('owner', 'employee')),
  created_at timestamptz not null default now()
);

-- Every new auth user gets an 'employee' profile. Trigger-only function: nobody may call it via the API.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users that existed before this script ran:
insert into public.profiles (id) select id from auth.users on conflict do nothing;

-- Owner check lives in a schema that is NOT exposed through the Data API.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role' = 'owner', false)
      or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'owner');
$$;
revoke execute on function private.is_owner() from public, anon;
grant execute on function private.is_owner() to authenticated;

-- ---------- products ----------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  barcode text,                                           -- null for products that have no barcode
  name text not null,
  unit text not null,
  selling_price numeric(12, 2) not null,
  company text not null,
  created_at timestamptz not null default now(),          -- when the product was added
  created_by uuid default auth.uid() references auth.users (id),
  created_by_email text,                                  -- "added by", stamped by trigger (cannot be forged)
  updated_at timestamptz default now(),
  constraint products_barcode_key unique (barcode),
  constraint products_barcode_not_blank check (barcode is null or length(barcode) > 0),
  constraint products_name_not_blank check (length(name) > 0),
  constraint products_company_not_blank check (length(company) > 0),
  constraint products_unit_check check (unit in ('pcs', 'kg', 'g', 'litre', 'ml', 'dozen', 'pack', 'box')),
  constraint products_price_check check (selling_price >= 0)
);

-- Upgrade for databases created before barcodes became optional (no-op on a fresh one).
alter table public.products alter column barcode drop not null;
alter table public.products drop constraint if exists products_barcode_not_blank;
alter table public.products add constraint products_barcode_not_blank check (barcode is null or length(barcode) > 0);

-- Trim/collapse text, stamp the author's email, keep audit columns immutable, keep updated_at current.
create or replace function public.products_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.barcode := nullif(btrim(new.barcode), '');                         -- blank means "no barcode"
  new.name := regexp_replace(btrim(new.name), '\s+', ' ', 'g');          -- trim + collapse inner spaces
  new.company := regexp_replace(btrim(new.company), '\s+', ' ', 'g');
  if tg_op = 'INSERT' then
    new.created_by_email := (select auth.jwt()) ->> 'email';
  else
    new.created_by_email := old.created_by_email;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end $$;
revoke execute on function public.products_before_write() from public, anon, authenticated;

drop trigger if exists products_before_write on public.products;
create trigger products_before_write before insert or update on public.products
  for each row execute function public.products_before_write();

-- The same product (name + company + unit) cannot be entered twice under a different barcode.
create unique index if not exists products_name_company_unit_key
  on public.products (lower(btrim(name)), lower(btrim(company)), lower(unit));

-- Fast name search (substring), delta sync, and the foreign key.
create extension if not exists pg_trgm with schema extensions;
create index if not exists products_name_trgm_idx
  on public.products using gin (lower(name) extensions.gin_trgm_ops);
create index if not exists products_updated_at_idx on public.products (updated_at);
create index if not exists products_created_by_idx on public.products (created_by);

-- ---------- Row Level Security ----------
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
  with check (created_by = (select auth.uid()));

drop policy if exists products_update on public.products;
create policy products_update on public.products for update to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));

drop policy if exists products_delete on public.products;
create policy products_delete on public.products for delete to authenticated
  using ((select private.is_owner()));

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
-- No insert/update/delete policies on profiles: clients can never change roles.
