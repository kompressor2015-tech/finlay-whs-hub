-- ==============================================================================
-- FINLAY WHS - MIGRATION whs_011: ADMIN-ONLY DELETE OF DO ENTRIES
-- ==============================================================================
-- Lets an administrator delete an incident, hazard, action or check that was made
-- in error or needs restarting. Nobody else can (the WHS officer included).
-- Notifiable incidents can never be deleted (the record must be kept).
-- Every delete leaves a line in whs_history saying who deleted what and when.
-- Safe to run again.
-- ==============================================================================

begin;

create or replace function public.whs_is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.whs_access(), '') = 'admin' $$;
revoke all on function public.whs_is_admin() from public;
grant execute on function public.whs_is_admin() to authenticated;

-- Tighten the direct delete rules from "officer" to "administrator".
drop policy if exists "whs officer delete incidents" on public.whs_incidents;
create policy "whs officer delete incidents" on public.whs_incidents for delete to authenticated
  using (public.whs_is_admin() and not notifiable);
drop policy if exists "whs officer delete hazards" on public.whs_hazards;
create policy "whs officer delete hazards" on public.whs_hazards for delete to authenticated
  using (public.whs_is_admin());
drop policy if exists "whs officer delete actions" on public.whs_actions;
create policy "whs officer delete actions" on public.whs_actions for delete to authenticated
  using (public.whs_is_admin());
drop policy if exists "whs officer delete checks" on public.whs_checks;
create policy "whs officer delete checks" on public.whs_checks for delete to authenticated
  using (public.whs_is_admin());

-- The one door the app uses. Returns the stored files ('bucket/path') to remove.
create or replace function public.whs_delete_record(p_type text, p_id uuid)
returns text[] language plpgsql security definer set search_path = public
as $$
declare
  files text[] := '{}';
  v_ref text;
  v_notifiable boolean;
begin
  if not public.whs_is_admin() then
    raise exception 'Only an administrator can delete entries';
  end if;

  if p_type = 'incident' then
    select ref, notifiable into v_ref, v_notifiable from public.whs_incidents where id = p_id;
    if v_ref is null then raise exception 'Incident not found'; end if;
    if v_notifiable then
      raise exception 'A notifiable incident must be kept as a record and cannot be deleted';
    end if;
    files := files
      || coalesce((select array_agg('whs-photos/' || p) from public.whs_incidents i, unnest(i.photos) p where i.id = p_id), '{}')
      || coalesce((select array_agg('whs-incident-files/' || file_path) from public.whs_incident_evidence where incident_id = p_id and file_path <> ''), '{}')
      || coalesce((select array_agg('whs-incident-files/' || file_path) from public.whs_incident_statements where incident_id = p_id and file_path <> ''), '{}')
      || coalesce((select array_agg('whs-claim-files/' || f) from (
            select file_path f from public.whs_claim_certificates where claim_id in (select id from public.whs_claims where incident_id = p_id)
            union all select file_path from public.whs_claim_log where claim_id in (select id from public.whs_claims where incident_id = p_id)
            union all select file_path from public.whs_claim_documents where claim_id in (select id from public.whs_claims where incident_id = p_id)
          ) x where f <> ''), '{}');
    delete from public.whs_actions where source_type = 'incident' and source_id = p_id;
    delete from public.whs_incidents where id = p_id;
    perform public.whs_log('incident', p_id, 'Deleted incident ' || v_ref);

  elsif p_type = 'hazard' then
    select ref into v_ref from public.whs_hazards where id = p_id;
    if v_ref is null then raise exception 'Hazard not found'; end if;
    files := coalesce((select array_agg('whs-photos/' || p) from public.whs_hazards h, unnest(h.photos) p where h.id = p_id), '{}');
    delete from public.whs_actions where source_type = 'hazard' and source_id = p_id;
    delete from public.whs_hazards where id = p_id;
    perform public.whs_log('hazard', p_id, 'Deleted hazard ' || v_ref);

  elsif p_type = 'action' then
    if not exists (select 1 from public.whs_actions where id = p_id) then raise exception 'Action not found'; end if;
    delete from public.whs_actions where id = p_id;
    perform public.whs_log('action', p_id, 'Deleted action');

  elsif p_type = 'check' then
    if not exists (select 1 from public.whs_checks where id = p_id) then raise exception 'Check not found'; end if;
    files := coalesce((select array_agg('whs-photos/' || p) from public.whs_checks c, unnest(c.photos) p where c.id = p_id), '{}');
    delete from public.whs_actions where source_type = 'inspection' and source_id = p_id;
    delete from public.whs_checks where id = p_id;
    perform public.whs_log('check', p_id, 'Deleted check');

  else
    raise exception 'Unknown record type';
  end if;

  return files;
end $$;
revoke all on function public.whs_delete_record(text, uuid) from public, anon;
grant execute on function public.whs_delete_record(text, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
