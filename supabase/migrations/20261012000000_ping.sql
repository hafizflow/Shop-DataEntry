-- Keep-alive target for the scheduled GitHub Action. Reads nothing; just proves the database is reachable.
create or replace function public.ping() returns integer
language sql stable set search_path = '' as $$ select 1 $$;
revoke all on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;
