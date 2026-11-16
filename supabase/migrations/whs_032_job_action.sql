-- whs_032_job_action.sql
-- A repair job (quote, PO, booking) can now have its action linked to it. The app keeps them in step: the
-- action's due date follows the job's booked date, and marking the job Done closes the action.
-- Links the Somerton rack repairs job to its action. Safe to run more than once.

begin;

alter table public.whs_check_jobs add column if not exists action_id uuid references public.whs_actions (id) on delete set null;

update public.whs_check_jobs j
   set action_id = (select a.id from public.whs_actions a where a.title like 'Rack repairs by Bowen Storage%' order by a.created_at limit 1)
 where j.quote_ref = 'PRM56999' and j.action_id is null;

-- The job's own fields stay as before; only the link can be set after it is created
create or replace function public.whs_check_job_stamps()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by_name := case when auth.uid() is null then new.created_by_name else public.whs_actor_name() end;
    new.created_at := now();
    if auth.uid() is not null and new.status <> 'quoted' and not public.whs_is_officer() then
      raise exception 'Only a WHS officer can approve a quote.';
    end if;
  else
    new.check_id := old.check_id;
    new.created_by_name := old.created_by_name;
    new.created_at := old.created_at;
    new.approved_by_name := old.approved_by_name;
    new.approved_on := old.approved_on;
    if old.status = 'quoted' and new.status in ('approved', 'po_raised', 'done') then
      if not public.whs_is_officer() then raise exception 'Only a WHS officer can approve a quote.'; end if;
      new.approved_by_name := public.whs_actor_name();
      new.approved_on := (now() at time zone 'Australia/Brisbane')::date;
    end if;
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
commit;
