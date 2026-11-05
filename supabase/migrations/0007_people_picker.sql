-- Anyone in a company can pick a colleague to assign work to, without being able to read
-- memberships (which carry branch scope and approval limits). Exposes the display name only.
create or replace function public.company_people(p_company uuid) returns table (user_id uuid, name text)
language sql stable security definer set search_path = public as $$
  select m.user_id, coalesce(nullif(p.display_name, ''), p.email)
    from memberships m join profiles p on p.id = m.user_id
   where m.company_id = p_company and m.status = 'active' and app.is_member(p_company)
   order by 2
$$;
grant execute on function public.company_people(uuid) to authenticated;
