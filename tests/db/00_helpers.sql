-- Shared assertion helpers for the other test files.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema t;
create function t.check(label text, ok boolean) returns void language plpgsql as $$
begin if ok is not true then raise exception 'FAILED: %', label; end if; end $$;
-- act as a signed-in user (or anon/superuser when null) for the rest of the transaction
create function t.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), false);
  execute case when u is null then 'reset role' else 'set role authenticated' end;
end $$;
create function t.denied(label text, stmt text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then return; end;
  raise exception 'FAILED (should have been refused): %', label;
end $$;
create function t.affected(stmt text) returns int language plpgsql as $$
declare n int; begin execute stmt; get diagnostics n = row_count; return n; end $$;
grant usage on schema t to public;
grant execute on all functions in schema t to public;

