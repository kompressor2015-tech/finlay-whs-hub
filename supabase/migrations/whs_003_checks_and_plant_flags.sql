-- ==============================================================================
-- FINLAY WHS - MIGRATION whs_003: PRE-STARTS, TAKE 5s, SITE INSPECTIONS, PLANT FLAGS
-- ==============================================================================
-- Run once in the Supabase dashboard (the same project as the Fleet Hub):
-- SQL Editor > New query > CLEAR THE EDITOR FIRST > paste > Run.
-- Safe to run again; all-or-nothing. Needs whs_001 and whs_002 to have been run.
--
-- BEFORE YOU RUN IT: back up (the free plan has no point-in-time restore).
--
-- WHAT IT ADDS (all new, all named whs_...; no fleet table or rule is changed)
--   whs_checklists   : the questions for pre-starts and site inspections. Starts with the
--                      draft pre-start and the Burpengary Yard site inspection (from Assignar).
--   whs_checks       : every completed pre-start, Take 5 and site inspection. Each keeps a
--                      copy of the questions it was done with, so editing a checklist later
--                      never changes old records.
--   whs_plant_flags  : safety flags on units. A failed pre-start raises one automatically,
--                      with an action for the workshop. The fleet status is NOT changed.
--
-- WHO CAN DO WHAT
--   Anyone with WHS access can do checks and see flags (so field staff know a unit is flagged).
--   Field staff see only their own checks; office roles see all.
--   Office roles (admin, whs_officer, supervisor) clear flags, with a note.
--   Only an admin or the WHS officer edits checklists. Completed checks cannot be edited.
-- ==============================================================================

begin;

-- 1. Tables ----------------------------------------------------------------------

create table if not exists public.whs_checklists (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('prestart', 'site')),
  name            text not null,
  site_id         text,
  site_name       text not null default '',
  frequency_days  integer check (frequency_days is null or frequency_days > 0),
  version         integer not null default 1,
  items           jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  active          boolean not null default true,
  updated_by_name text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.whs_checks (
  id                uuid primary key default gen_random_uuid(),
  kind              text not null check (kind in ('prestart', 'take5', 'site')),
  checklist_id      uuid references public.whs_checklists (id) on delete set null,
  checklist_name    text not null default '',
  checklist_version integer,
  items             jsonb not null default '[]'::jsonb,
  answers           jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  machine_id        text,
  unit_no           text not null default '',
  site_id           text,
  site_name         text not null default '',
  engine_hours      numeric,
  task              text not null default '',
  hazards           text[] not null default '{}',
  controls          text[] not null default '{}',
  crew              text not null default '',
  safe_to_start     boolean,
  comments          text not null default '',
  photos            text[] not null default '{}',
  signed_off        boolean not null default false,
  result            text not null default 'ok' check (result in ('ok', 'fault', 'stop', 'issues')),
  issue_count       integer not null default 0,
  done_by           uuid not null default auth.uid(),
  done_by_name      text not null default '',
  done_at           timestamptz not null default now()
);

create table if not exists public.whs_plant_flags (
  id            uuid primary key default gen_random_uuid(),
  machine_id    text,
  unit_no       text not null,
  level         text not null check (level in ('stop', 'fault')),
  reason        text not null,
  check_id      uuid references public.whs_checks (id) on delete set null,
  incident_id   uuid references public.whs_incidents (id) on delete set null,
  action_id     uuid references public.whs_actions (id) on delete set null,
  raised_by     uuid default auth.uid(),
  raised_by_name text not null default '',
  raised_at     timestamptz not null default now(),
  cleared_at    timestamptz,
  cleared_by    uuid,
  cleared_by_name text not null default '',
  clear_note    text not null default ''
);

create index if not exists whs_checks_kind_idx on public.whs_checks (kind, done_at desc);
create index if not exists whs_checks_machine_idx on public.whs_checks (machine_id, done_at desc) where kind = 'prestart';
create index if not exists whs_flags_open_idx on public.whs_plant_flags (unit_no) where cleared_at is null;

-- 2. Is an answer a problem? (pass/fail "fail", the "bad" yes/no answer, or a tick list not fully ticked)

create or replace function public.whs_item_problem(item jsonb, ans jsonb)
returns boolean language sql immutable
as $$
  select case
    when ans is null or ans = 'null'::jsonb then false
    when item->>'type' = 'pass_fail' then ans->>'v' = 'fail'
    when item->>'type' = 'yes_no' then ans->>'v' = item->>'bad'
    when item->>'type' = 'tick_list' then
      jsonb_typeof(ans->'v') = 'array'
      and jsonb_array_length(ans->'v') < jsonb_array_length(coalesce(item->'options', '[]'::jsonb))
    else false
  end
$$;

-- 3. Stamps and rules the database applies itself ------------------------------------

create or replace function public.whs_checklist_stamps()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.version := case when new.items is distinct from old.items then old.version + 1 else old.version end;
  end if;
  new.updated_by_name := public.whs_actor_name();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists whs_checklist_stamps on public.whs_checklists;
create trigger whs_checklist_stamps before insert or update on public.whs_checklists
  for each row execute function public.whs_checklist_stamps();

create or replace function public.whs_check_stamps()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  cl record;
  problems integer := 0;
  critical integer := 0;
  it jsonb;
begin
  new.done_by := coalesce(auth.uid(), new.done_by);
  new.done_by_name := public.whs_actor_name();
  new.done_at := now();

  -- The questions always come from the checklist itself, never from the app.
  if new.checklist_id is not null then
    select * into cl from public.whs_checklists where id = new.checklist_id;
    if not found then
      raise exception 'That checklist no longer exists';
    end if;
    new.checklist_name := cl.name;
    new.checklist_version := cl.version;
    new.items := cl.items;
  elsif new.kind <> 'take5' then
    raise exception 'A pre-start or site inspection needs a checklist';
  end if;

  for it in select * from jsonb_array_elements(new.items) loop
    if public.whs_item_problem(it, new.answers -> (it->>'id')) then
      problems := problems + 1;
      if coalesce((it->>'critical')::boolean, false) then
        critical := critical + 1;
      end if;
    end if;
  end loop;

  new.issue_count := problems;
  new.result := case
    when new.kind = 'take5' then case when coalesce(new.safe_to_start, false) then 'ok' else 'stop' end
    when new.kind = 'prestart' then case when critical > 0 then 'stop' when problems > 0 then 'fault' else 'ok' end
    else case when problems > 0 then 'issues' else 'ok' end
  end;
  return new;
end;
$$;

drop trigger if exists whs_check_stamps on public.whs_checks;
create trigger whs_check_stamps before insert on public.whs_checks
  for each row execute function public.whs_check_stamps();

-- A failed pre-start raises a flag on the unit and an action for the workshop.
create or replace function public.whs_check_followups()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  reasons text;
  new_action uuid;
  new_flag uuid;
  label text;
begin
  if new.kind = 'prestart' and new.result in ('fault', 'stop') then
    select string_agg(
             (it->>'text') || coalesce(': ' || nullif(new.answers -> (it->>'id') ->> 'note', ''), ''),
             '; ' order by ord)
      into reasons
      from jsonb_array_elements(new.items) with ordinality as t(it, ord)
     where public.whs_item_problem(it, new.answers -> (it->>'id'));

    label := 'Pre-start ' || coalesce(nullif(new.unit_no, ''), 'unit') || ' ' || to_char(new.done_at at time zone 'Australia/Brisbane', 'DD/MM/YYYY');

    insert into public.whs_actions (title, source_type, source_id, source_ref, machine_id, unit_no, owner_id, due)
    values (
      left('Fix ' || case when new.result = 'stop' then 'critical fault' else 'fault' end
           || ' on unit ' || coalesce(nullif(new.unit_no, ''), '?') || ': ' || reasons, 300),
      'inspection', new.id, label, new.machine_id, new.unit_no, null,
      (new.done_at at time zone 'Australia/Brisbane')::date + case when new.result = 'stop' then 1 else 7 end
    )
    returning id into new_action;

    insert into public.whs_plant_flags (machine_id, unit_no, level, reason, check_id, action_id, raised_by, raised_by_name)
    values (new.machine_id, coalesce(nullif(new.unit_no, ''), '?'), new.result, reasons, new.id, new_action, new.done_by, new.done_by_name)
    returning id into new_flag;

    perform public.whs_log('flag', new_flag,
      case when new.result = 'stop' then 'Unit flagged: do not use' else 'Unit flagged: fault reported' end);
  end if;

  if new.kind = 'take5' and new.result = 'stop' then
    perform public.whs_log('check', new.id, 'Take 5: not safe to start');
  end if;
  return new;
end;
$$;

drop trigger if exists whs_check_followups on public.whs_checks;
create trigger whs_check_followups after insert on public.whs_checks
  for each row execute function public.whs_check_followups();

-- Flags: who raised and cleared them is stamped here; clearing needs a note.
create or replace function public.whs_flag_stamps()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.raised_by := auth.uid();
      new.raised_by_name := public.whs_actor_name();
    end if;
    new.raised_at := now();
    new.cleared_at := null;
    return new;
  end if;
  new.machine_id := old.machine_id;
  new.unit_no := old.unit_no;
  new.raised_by := old.raised_by;
  new.raised_by_name := old.raised_by_name;
  new.raised_at := old.raised_at;
  new.check_id := old.check_id;
  if new.cleared_at is not null and old.cleared_at is null then
    if coalesce(btrim(new.clear_note), '') = '' then
      raise exception 'Add a note saying why the flag can be cleared';
    end if;
    new.cleared_at := now();
    new.cleared_by := auth.uid();
    new.cleared_by_name := public.whs_actor_name();
    perform public.whs_log('flag', new.id, 'Flag cleared: ' || left(new.clear_note, 200));
  elsif new.cleared_at is null and old.cleared_at is not null then
    new.cleared_by := null;
    new.cleared_by_name := '';
    perform public.whs_log('flag', new.id, 'Flag put back');
  end if;
  return new;
end;
$$;

drop trigger if exists whs_flag_stamps on public.whs_plant_flags;
create trigger whs_flag_stamps before insert or update on public.whs_plant_flags
  for each row execute function public.whs_flag_stamps();

-- 4. Access rules -----------------------------------------------------------------

alter table public.whs_checklists  enable row level security;
alter table public.whs_checks      enable row level security;
alter table public.whs_plant_flags enable row level security;

drop policy if exists "whs read checklists" on public.whs_checklists;
drop policy if exists "whs officer write checklists" on public.whs_checklists;
create policy "whs read checklists" on public.whs_checklists for select to authenticated
  using (public.whs_is_member());
create policy "whs officer write checklists" on public.whs_checklists for all to authenticated
  using (public.whs_is_officer()) with check (public.whs_is_officer());

drop policy if exists "whs read checks" on public.whs_checks;
drop policy if exists "whs do checks" on public.whs_checks;
drop policy if exists "whs officer delete checks" on public.whs_checks;
create policy "whs read checks" on public.whs_checks for select to authenticated
  using (public.whs_is_office() or (public.whs_is_member() and done_by = auth.uid()));
create policy "whs do checks" on public.whs_checks for insert to authenticated
  with check (public.whs_is_member());
create policy "whs officer delete checks" on public.whs_checks for delete to authenticated
  using (public.whs_is_officer());
-- No update rule: a completed check is a record and cannot be changed.

drop policy if exists "whs read flags" on public.whs_plant_flags;
drop policy if exists "whs office raise flags" on public.whs_plant_flags;
drop policy if exists "whs office clear flags" on public.whs_plant_flags;
drop policy if exists "whs officer delete flags" on public.whs_plant_flags;
create policy "whs read flags" on public.whs_plant_flags for select to authenticated
  using (public.whs_is_member());
create policy "whs office raise flags" on public.whs_plant_flags for insert to authenticated
  with check (public.whs_is_office());
create policy "whs office clear flags" on public.whs_plant_flags for update to authenticated
  using (public.whs_is_office()) with check (public.whs_is_office());
create policy "whs officer delete flags" on public.whs_plant_flags for delete to authenticated
  using (public.whs_is_officer());

grant select, insert, update, delete on public.whs_checklists, public.whs_checks, public.whs_plant_flags to authenticated;

-- 5. Starting checklists (only added once) ---------------------------------------------

insert into public.whs_checklists (kind, name, items)
select 'prestart', 'Pre-start: screeners and crushers', $json$[
  {"id":"guards","section":"Checks","type":"pass_fail","text":"Guards and covers in place","sub":"Belts, pulleys, rollers, drives, fan","critical":true},
  {"id":"estop","section":"Checks","type":"pass_fail","text":"Emergency stops work","sub":"Test each e-stop and pull-wire","critical":true},
  {"id":"leaks","section":"Checks","type":"pass_fail","text":"No oil, fuel or coolant leaks","sub":"Under the machine and around the engine"},
  {"id":"hoses","section":"Checks","type":"pass_fail","text":"Hydraulic hoses and fittings OK","sub":"No rubbing, bulges or weeping"},
  {"id":"tracks","section":"Checks","type":"pass_fail","text":"Tracks and undercarriage OK"},
  {"id":"conveyors","section":"Checks","type":"pass_fail","text":"Conveyors, rollers and scrapers OK","sub":"Belt tracking, no build-up"},
  {"id":"access","section":"Checks","type":"pass_fail","text":"Walkways, ladders and handrails secure","critical":true},
  {"id":"lights","section":"Checks","type":"pass_fail","text":"Lights, beacon, horn and travel alarm work"},
  {"id":"fire","section":"Checks","type":"pass_fail","text":"Fire extinguisher present and charged","critical":true},
  {"id":"fluids","section":"Checks","type":"pass_fail","text":"Fluid levels OK","sub":"Engine oil, hydraulic oil, coolant, fuel"},
  {"id":"isolation","section":"Checks","type":"pass_fail","text":"Isolation and lock-out points OK","sub":"Main isolator, lock-out hasps","critical":true}
]$json$::jsonb
where not exists (select 1 from public.whs_checklists where kind = 'prestart');

insert into public.whs_checklists (kind, name, site_id, site_name, frequency_days, items)
select 'site', 'Site inspection: Burpengary Yard',
  (select id from public.depot_sites where name ilike '%burpengary%' order by name limit 1),
  'Burpengary Yard', 30, $json$[
  {"id":"wash_bay","section":"Yard and store areas","type":"yes_no","text":"Does the wash bay need emptying?","bad":"yes"},
  {"id":"wash_bay_photo","section":"Yard and store areas","type":"photo","text":"Photo of the wash bay area","min_photos":1},
  {"id":"shed_drain_photo","section":"Yard and store areas","type":"photo","text":"Photo of the drain next to the yard shed","min_photos":1},
  {"id":"racking","section":"Yard and store areas","type":"tick_list","text":"Racking / storage stores shed","options":["Items are stacked correctly and pallets locked into racking","Pallets are in good condition","Items are within racking load limits","Racking is in safe working condition"]},
  {"id":"racking_photos","section":"Yard and store areas","type":"photo","text":"Photos of the racking","min_photos":2},
  {"id":"toilets","section":"Yard and store areas","type":"yes_no","text":"Any issues with toilets? (plumbing, drainage, cleanliness)","bad":"yes"},
  {"id":"crib_tidy","section":"Yard and store areas","type":"yes_no","text":"Crib room tidy?","bad":"no"},
  {"id":"crib_photo","section":"Yard and store areas","type":"photo","text":"Crib room and designated smoking area","min_photos":1},
  {"id":"access_clear","section":"Yard and store areas","type":"yes_no","text":"Clear access to and from work areas?","bad":"no"},
  {"id":"stores_issues","section":"Yard and store areas","type":"yes_no","text":"Any issues with stores areas? (packing shed, dispatch areas)","bad":"yes"},
  {"id":"stores_photos","section":"Yard and store areas","type":"photo","text":"Photos of the stores packing shed","min_photos":3},
  {"id":"roof","section":"Yard and store areas","type":"yes_no","text":"Any roof or gutter issues?","bad":"yes"},
  {"id":"trips","section":"Yard and store areas","type":"yes_no","text":"Any hazards such as trips or blocked walkways?","bad":"yes"},
  {"id":"vermin","section":"Yard and store areas","type":"yes_no","text":"Any vermin or pest issues?","bad":"yes"},
  {"id":"bollard_drain_photo","section":"Yard and store areas","type":"photo","text":"Photo of the drain near the bollards (yard concrete area)","min_photos":1},
  {"id":"office_clean","section":"Grounds maintenance","type":"yes_no","text":"Around the office clean and clear of debris?","bad":"no"},
  {"id":"office_photos","section":"Grounds maintenance","type":"photo","text":"Photos around the office","min_photos":2},
  {"id":"hedges","section":"Grounds maintenance","type":"yes_no","text":"Do the hedges around the office need attention?","bad":"yes"},
  {"id":"hedges_photo","section":"Grounds maintenance","type":"photo","text":"Photo of the hedges","min_photos":1},
  {"id":"gardens","section":"Grounds maintenance","type":"yes_no","text":"Do the garden beds need attention?","bad":"yes"},
  {"id":"driveway","section":"Grounds maintenance","type":"yes_no","text":"Any driveway issues?","bad":"yes"},
  {"id":"bins","section":"Grounds maintenance","type":"yes_no","text":"Waste bins for work areas adequate?","bad":"no"},
  {"id":"top_yard_photos","section":"Oil shed and top yard","type":"photo","text":"Photos of the workshop top yard","min_photos":2},
  {"id":"dangerous_goods","section":"Oil shed and top yard","type":"tick_list","text":"Oil, paint and dangerous goods","options":["Safety data sheets available","Hazard signage displayed","Storage areas clean and tidy"]},
  {"id":"oil_store","section":"Oil shed and top yard","type":"yes_no","text":"Oil store clean and tidy?","bad":"no"},
  {"id":"oil_store_photo","section":"Oil shed and top yard","type":"photo","text":"Photo of the oil store","min_photos":1},
  {"id":"weeding","section":"Bottom yard","type":"yes_no","text":"Weeding required?","bad":"yes"},
  {"id":"laydown_photos","section":"Bottom yard","type":"photo","text":"Photos of the laydown areas / bottom yard","min_photos":3},
  {"id":"skips","section":"Bottom yard","type":"yes_no","text":"Material skips adequate? (metal and wood)","bad":"no"},
  {"id":"bottom_drain_photo","section":"Bottom yard","type":"photo","text":"Photo of the bottom yard drain","min_photos":1}
]$json$::jsonb
where not exists (select 1 from public.whs_checklists where kind = 'site' and name = 'Site inspection: Burpengary Yard');

commit;

-- CHECK IT WORKED (optional):
--   select kind, name, version, jsonb_array_length(items) as questions from public.whs_checklists;
--   -- expect 2 rows: the pre-start (11 questions) and Burpengary Yard (30 questions)
