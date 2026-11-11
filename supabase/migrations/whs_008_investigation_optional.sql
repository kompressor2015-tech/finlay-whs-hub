-- WHS app step 8: "Investigation not required". Some incidents (a minor injury, a test report) do not
-- need the full investigation. The WHS officer can mark one as not required, with a reason, and it can
-- then be closed without the six parts. Notifiable incidents can never be waived.
-- Adds two columns to whs_incidents and replaces the incident stamp function. Safe to re-run.

alter table public.whs_incidents add column if not exists investigation_waived boolean not null default false;
alter table public.whs_incidents add column if not exists investigation_waived_reason text not null default '';

create or replace function public.whs_incident_stamps()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.ref := 'INC-' || lpad(nextval('public.whs_incident_ref_seq')::text, 4, '0');
    new.reported_by := coalesce(auth.uid(), new.reported_by);
    new.reporter_name := public.whs_actor_name();
    new.status := 'new';
    new.closed_at := null;
    new.closed_by := null;
    new.created_at := now();
  else
    new.ref := old.ref;
    new.reported_by := old.reported_by;
    new.reporter_name := old.reporter_name;
    new.created_at := old.created_at;
    if new.investigation_waived and cardinality(new.notifiable_reasons) > 0 then
      raise exception 'A notifiable incident has to be investigated';
    end if;
    if new.investigation_waived and btrim(new.investigation_waived_reason) = '' then
      raise exception 'Say why this incident does not need an investigation';
    end if;
    if new.status = 'closed' and old.status is distinct from 'closed' then
      if auth.uid() is not null and not public.whs_is_officer() then
        raise exception 'Only an admin or the WHS officer can close an incident';
      end if;
      if exists (select 1 from public.whs_actions a
                 where a.source_type = 'incident' and a.source_id = new.id and a.status <> 'done') then
        raise exception 'Finish all of this incident''s actions before closing it';
      end if;
      if new.type = 'injury' or cardinality(new.notifiable_reasons) > 0 then
        if not new.investigation_waived and (select count(distinct p) from unnest(new.parts_done) p) < 6 then
          raise exception 'Finish all six investigation parts before closing this incident';
        end if;
        if exists (select 1 from public.whs_claims c where c.incident_id = new.id and c.status not in ('closed', 'rejected')) then
          raise exception 'Close the claim before closing this incident';
        end if;
      end if;
      new.closed_at := now();
      new.closed_by := auth.uid();
    elsif new.status <> 'closed' then
      new.closed_at := null;
      new.closed_by := null;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
