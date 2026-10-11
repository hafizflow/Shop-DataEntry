-- Only the name is required. Unit, selling price and company may be left empty (null).
alter table public.products alter column unit drop not null;
alter table public.products alter column selling_price drop not null;
alter table public.products alter column company drop not null;

alter table public.products drop constraint if exists products_company_not_blank;
alter table public.products add constraint products_company_not_blank check (company is null or length(company) > 0);

create or replace function public.products_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.barcode := nullif(btrim(new.barcode), '');
  new.name := regexp_replace(btrim(new.name), '\s+', ' ', 'g');
  new.company := nullif(regexp_replace(btrim(new.company), '\s+', ' ', 'g'), '');   -- blank means "no company"
  if tg_op = 'INSERT' then
    new.created_by_email := (select auth.jwt()) ->> 'email';
  else
    new.created_by_email := old.created_by_email;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.barcode := old.barcode;
    new.updated_at := now();
  end if;
  return new;
end $$;
revoke execute on function public.products_before_write() from public, anon, authenticated;

-- Nulls count as empty text, so the same name with no company/unit still cannot be entered twice.
drop index if exists public.products_name_company_unit_key;
create unique index products_name_company_unit_key
  on public.products (lower(btrim(name)), lower(coalesce(btrim(company), '')), lower(coalesce(unit, '')));
