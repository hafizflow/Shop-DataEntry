-- Employees may edit products (not delete). The barcode becomes immutable so an edit can never create a duplicate.
create or replace function public.products_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.barcode := nullif(btrim(new.barcode), '');
  new.name := regexp_replace(btrim(new.name), '\s+', ' ', 'g');
  new.company := regexp_replace(btrim(new.company), '\s+', ' ', 'g');
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

drop policy if exists products_update on public.products;
create policy products_update on public.products for update to authenticated
  using (true) with check (true);
