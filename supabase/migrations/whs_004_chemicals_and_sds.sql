-- ==============================================================================
-- FINLAY WHS - MIGRATION whs_004: CHEMICALS, SDS AND STOCK BY SITE
-- ==============================================================================
-- Run once in the Supabase dashboard (the same project as the Fleet Hub):
-- SQL Editor > New query > CLEAR THE EDITOR FIRST > paste > Run.
-- Safe to run again; all-or-nothing. Needs whs_001 to whs_003 to have been run.
--
-- BEFORE YOU RUN IT: back up (the free plan has no point-in-time restore).
--
-- WHAT IT ADDS (all new, all named whs_...; no fleet table or rule is changed)
--   whs_sites         : Burpengary Yard (QLD), Somerton Workshop (VIC), Tomago Site (NSW),
--                       each with its state, so the right rules and thresholds apply.
--   whs_chemicals     : each product once: DG class, UN number, packing group, hazards,
--                       PPE, first aid and spill steps.
--   whs_chem_stock    : where each product is kept at each site, the container, how many,
--                       the most you mean to keep, and when it was last counted.
--   whs_stock_counts  : every stocktake count, dated, so the register shows it was checked.
--   whs_sds           : SDS files and their issue dates (old versions are kept).
--   whs-sds           : a private store for the SDS PDFs.
--
-- STARTING DATA: the 77 products from the Somerton and Tomago registers (2026), with their
-- storage locations. Burpengary starts with all 77; add the rest there. Quantities start
-- empty until the first stocktake.
--
-- WHO CAN DO WHAT
--   Everyone with WHS access can read the register and open SDS files, and can record
--   stocktake counts. Office roles add and change chemicals, locations and SDS files.
--   Only an admin or the WHS officer deletes.
-- ==============================================================================

begin;

-- 1. Tables ----------------------------------------------------------------------

create table if not exists public.whs_sites (
  id              text primary key,
  name            text not null,
  state           text not null check (state in ('QLD', 'NSW', 'VIC')),
  code            text not null,
  depot_site_id   text,
  stocktake_days  integer not null default 90 check (stocktake_days > 0),
  created_at      timestamptz not null default now()
);

create table if not exists public.whs_chemicals (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  manufacturer   text not null default '',
  dg_class       text check (dg_class is null or dg_class in ('2.1','2.2','2.3','3','4.1','4.2','4.3','5.1','5.2','6.1','8','9')),
  subsidiary     text not null default '',
  packing_group  text check (packing_group is null or packing_group in ('I','II','III')),
  un_number      text,
  aerosol        boolean not null default false,
  combustible    text check (combustible is null or combustible in ('C1','C2')),
  ghs_hazardous  boolean,
  hazard_summary text not null default '',
  h_statements   text[] not null default '{}',
  ppe            text[] not null default '{}',
  first_aid      text not null default '',
  spill          text not null default '',
  supplier_phone text not null default '',
  section        text not null default 'Chemicals, adhesives & reagents',
  notes          text not null default '',
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists whs_chemicals_name_idx on public.whs_chemicals (lower(name));

create table if not exists public.whs_chem_stock (
  id                   uuid primary key default gen_random_uuid(),
  chemical_id          uuid not null references public.whs_chemicals (id) on delete cascade,
  site_id              text not null references public.whs_sites (id),
  location             text not null,
  container            text not null default '',
  container_size       numeric check (container_size is null or container_size > 0),
  unit                 text not null default 'L' check (unit in ('L', 'kg')),
  count                numeric check (count is null or count >= 0),
  max_count            numeric check (max_count is null or max_count >= 0),
  last_counted_at      timestamptz,
  last_counted_by_name text not null default '',
  created_at           timestamptz not null default now()
);
create index if not exists whs_chem_stock_site_idx on public.whs_chem_stock (site_id);
create index if not exists whs_chem_stock_chem_idx on public.whs_chem_stock (chemical_id);

create table if not exists public.whs_stock_counts (
  id              bigint generated always as identity primary key,
  stock_id        uuid not null references public.whs_chem_stock (id) on delete cascade,
  count           numeric not null check (count >= 0),
  counted_at      timestamptz not null default now(),
  counted_by      uuid default auth.uid(),
  counted_by_name text not null default ''
);
create index if not exists whs_stock_counts_idx on public.whs_stock_counts (stock_id, counted_at desc);

create table if not exists public.whs_sds (
  id               uuid primary key default gen_random_uuid(),
  chemical_id      uuid not null references public.whs_chemicals (id) on delete cascade,
  file_path        text not null,
  file_name        text not null default '',
  issue_date       date not null,
  uploaded_at      timestamptz not null default now(),
  uploaded_by_name text not null default ''
);
create index if not exists whs_sds_chem_idx on public.whs_sds (chemical_id, issue_date desc);

-- 2. Stamps ----------------------------------------------------------------------

create or replace function public.whs_chemical_touch()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists whs_chemical_touch on public.whs_chemicals;
create trigger whs_chemical_touch before insert or update on public.whs_chemicals
  for each row execute function public.whs_chemical_touch();

create or replace function public.whs_sds_stamps()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.uploaded_at := now();
  new.uploaded_by_name := public.whs_actor_name();
  return new;
end;
$$;
drop trigger if exists whs_sds_stamps on public.whs_sds;
create trigger whs_sds_stamps before insert on public.whs_sds
  for each row execute function public.whs_sds_stamps();

-- Stocktake: anyone with WHS access records a count; the database stamps who and when
-- and keeps every count.
create or replace function public.whs_record_count(p_stock_id uuid, p_count numeric)
returns void language plpgsql security definer set search_path = public
as $$
declare
  who text := public.whs_actor_name();
begin
  if not public.whs_is_member() then
    raise exception 'You do not have access to the WHS app';
  end if;
  if p_count is null or p_count < 0 then
    raise exception 'A count cannot be negative';
  end if;
  update public.whs_chem_stock
     set count = p_count, last_counted_at = now(), last_counted_by_name = who
   where id = p_stock_id;
  if not found then
    raise exception 'That storage location no longer exists';
  end if;
  insert into public.whs_stock_counts (stock_id, count, counted_by, counted_by_name)
  values (p_stock_id, p_count, auth.uid(), who);
end;
$$;
revoke all on function public.whs_record_count(uuid, numeric) from public, anon;
grant execute on function public.whs_record_count(uuid, numeric) to authenticated;

-- 3. Access rules -----------------------------------------------------------------

alter table public.whs_sites        enable row level security;
alter table public.whs_chemicals    enable row level security;
alter table public.whs_chem_stock   enable row level security;
alter table public.whs_stock_counts enable row level security;
alter table public.whs_sds          enable row level security;

drop policy if exists "whs read sites" on public.whs_sites;
drop policy if exists "whs officer sites" on public.whs_sites;
create policy "whs read sites" on public.whs_sites for select to authenticated using (public.whs_is_member());
create policy "whs officer sites" on public.whs_sites for all to authenticated
  using (public.whs_is_officer()) with check (public.whs_is_officer());

drop policy if exists "whs read chemicals" on public.whs_chemicals;
drop policy if exists "whs office add chemicals" on public.whs_chemicals;
drop policy if exists "whs office change chemicals" on public.whs_chemicals;
drop policy if exists "whs officer delete chemicals" on public.whs_chemicals;
create policy "whs read chemicals" on public.whs_chemicals for select to authenticated using (public.whs_is_member());
create policy "whs office add chemicals" on public.whs_chemicals for insert to authenticated with check (public.whs_is_office());
create policy "whs office change chemicals" on public.whs_chemicals for update to authenticated
  using (public.whs_is_office()) with check (public.whs_is_office());
create policy "whs officer delete chemicals" on public.whs_chemicals for delete to authenticated using (public.whs_is_officer());

drop policy if exists "whs read stock" on public.whs_chem_stock;
drop policy if exists "whs office add stock" on public.whs_chem_stock;
drop policy if exists "whs office change stock" on public.whs_chem_stock;
drop policy if exists "whs officer delete stock" on public.whs_chem_stock;
create policy "whs read stock" on public.whs_chem_stock for select to authenticated using (public.whs_is_member());
create policy "whs office add stock" on public.whs_chem_stock for insert to authenticated with check (public.whs_is_office());
create policy "whs office change stock" on public.whs_chem_stock for update to authenticated
  using (public.whs_is_office()) with check (public.whs_is_office());
create policy "whs officer delete stock" on public.whs_chem_stock for delete to authenticated using (public.whs_is_officer());

drop policy if exists "whs read counts" on public.whs_stock_counts;
create policy "whs read counts" on public.whs_stock_counts for select to authenticated using (public.whs_is_member());
-- Counts are only written by whs_record_count().

drop policy if exists "whs read sds" on public.whs_sds;
drop policy if exists "whs office add sds" on public.whs_sds;
drop policy if exists "whs officer delete sds" on public.whs_sds;
create policy "whs read sds" on public.whs_sds for select to authenticated using (public.whs_is_member());
create policy "whs office add sds" on public.whs_sds for insert to authenticated with check (public.whs_is_office());
create policy "whs officer delete sds" on public.whs_sds for delete to authenticated using (public.whs_is_officer());

grant select, insert, update, delete on public.whs_sites, public.whs_chemicals, public.whs_chem_stock, public.whs_sds to authenticated;
grant select on public.whs_stock_counts to authenticated;

-- 4. Private store for SDS PDFs ----------------------------------------------------

insert into storage.buckets (id, name, public)
values ('whs-sds', 'whs-sds', false)
on conflict (id) do update set public = false;

drop policy if exists "whs read sds files" on storage.objects;
drop policy if exists "whs office upload sds files" on storage.objects;
drop policy if exists "whs officer delete sds files" on storage.objects;
create policy "whs read sds files" on storage.objects for select to authenticated
  using (bucket_id = 'whs-sds' and public.whs_is_member());
create policy "whs office upload sds files" on storage.objects for insert to authenticated
  with check (bucket_id = 'whs-sds' and public.whs_is_office());
create policy "whs officer delete sds files" on storage.objects for delete to authenticated
  using (bucket_id = 'whs-sds' and public.whs_is_officer());

-- 5. Starting data -------------------------------------------------------------------

insert into public.whs_sites (id, name, state, code, depot_site_id) values
  ('burpengary', 'Burpengary Yard', 'QLD', 'BUR', (select id from public.depot_sites where name ilike '%burpengary%' order by name limit 1)),
  ('somerton', 'Somerton Workshop', 'VIC', 'SOM', (select id from public.depot_sites where name ilike '%somerton%' order by name limit 1)),
  ('tomago', 'Tomago Site', 'NSW', 'TOM', (select id from public.depot_sites where name ilike '%tomago%' order by name limit 1))
on conflict (id) do nothing;

-- 77 products: 47 at Somerton, 75 at Tomago, all 77 at Burpengary
insert into public.whs_chemicals (name, manufacturer, dg_class, subsidiary, packing_group, un_number, aerosol, combustible, hazard_summary, section, ghs_hazardous)
select v.* from (values
  ('BOC Acetylene (Dissolved)', 'BOC Limited', '2.1', '', null, '1001', false, null, 'Flammable gas', 'Gases, fuels & aerosols', true::boolean),
  ('BOC Argoshield Universal', 'BOC Limited', '2.2', '', null, '1956', false, null, 'Non-flammable gas under pressure', 'Gases, fuels & aerosols', true::boolean),
  ('BOC Oxygen Compressed', 'BOC Limited', '2.2', '5.1', null, '1072', false, null, 'Oxidising gas under pressure', 'Gases, fuels & aerosols', true::boolean),
  ('Elgas LPG (Propane)', 'Elgas Limited', '2.1', '', null, '1978', false, null, 'Flammable gas', 'Gases, fuels & aerosols', true::boolean),
  ('Butane Gas (Cartridges)', 'Generic / Various', '2.1', '', null, '2037', false, null, 'Flammable gas', 'Gases, fuels & aerosols', true::boolean),
  ('Automotive Diesel Fuel', 'Various Fuel Suppliers', null, '', null, '1202', false, 'C1', 'Combustible liquid C1 (flammable liquid category 4)', 'Gases, fuels & aerosols', true::boolean),
  ('Unleaded Petrol (ULP)', 'Various Fuel Suppliers', '3', '', 'II', '1203', false, null, 'Flammable liquid', 'Gases, fuels & aerosols', true::boolean),
  ('Weld Guard Heavy Duty Anti-Spatter', 'Weld Guard / Specialised', '2.1', '', null, '1950', true, null, 'Flammable aerosol', 'Gases, fuels & aerosols', true::boolean),
  ('CRC Brakleen Parts Cleaner', 'CRC Industries', '2.1', '', null, '1950', true, null, 'Flammable aerosol', 'Gases, fuels & aerosols', true::boolean),
  ('CRC Lectra Shield Aerosol', 'CRC Industries', '2.1', '', null, '1950', true, null, 'Flammable aerosol', 'Gases, fuels & aerosols', true::boolean),
  ('CRC Multi-purpose Lubricant', 'CRC Industries', '2.1', '', null, '1950', true, null, 'Flammable aerosol', 'Gases, fuels & aerosols', true::boolean),
  ('Power Lube Multi-purpose Lubricant', 'CRC Industries', '2.1', '', null, '1950', true, null, 'Flammable aerosol', 'Gases, fuels & aerosols', true::boolean),
  ('Galmet Spraypaint Primer Aerosol', 'ITW Polymers / Galmet', '2.1', '', null, '1950', true, null, 'Flammable aerosol', 'Gases, fuels & aerosols', true::boolean),
  ('GPI 1K Fillclean Aerosol Cans', 'GPI Automotive Products', '2.1', '', null, '1950', true, null, 'Flammable aerosol', 'Gases, fuels & aerosols', true::boolean),
  ('Seymour Spray Paint (16-3395)', 'Seymour of Sycamore', '2.1', '', null, '1950', true, null, 'Flammable aerosol', 'Gases, fuels & aerosols', true::boolean),
  ('Signet Line Marking Paint Yellow', 'Signet Pty Ltd', '2.1', '', null, '1950', true, null, 'Flammable aerosol', 'Gases, fuels & aerosols', true::boolean),
  ('U-Pol CCUP-AL Clearcoat Aerosol', 'U-Pol Australia', '2.1', '', null, '1950', true, null, 'Flammable aerosol', 'Gases, fuels & aerosols', true::boolean),
  ('Methylated Spirits v10', 'Recochem / Various', '3', '', 'II', '1170', false, null, 'Flammable liquid', 'Gases, fuels & aerosols', true::boolean),
  ('Mineral Turpentine v8', 'Recochem / Various', '3', '', 'III', '1300', false, null, 'Flammable liquid', 'Gases, fuels & aerosols', true::boolean),
  ('Superglow Multipurpose Thinner', 'Motospray / HiChem', '3', '', 'II', '1263', false, null, 'Flammable liquid', 'Gases, fuels & aerosols', true::boolean),
  ('Metalshield Spray Thinner (965-H0009)', 'Dulux Protective Coatings', '3', '', 'II', '1263', false, null, 'Flammable liquid', 'Gases, fuels & aerosols', true::boolean),
  ('Workshop Degreaser (Solvent base)', 'Generic / Various', '3', '', null, '1993', false, null, 'Combustible C1 or Class 3: confirm from the SDS', 'Gases, fuels & aerosols', true::boolean),
  ('Galmet Rust Paint – Silver', 'ITW Polymers / Galmet', '3', '', 'III', '1263', false, null, 'Flammable liquid', 'Paints, coatings & bonding', true::boolean),
  ('Galmet Rust Paint – All Colours', 'ITW Polymers / Galmet', '3', '', 'III', '1263', false, null, 'Flammable liquid', 'Paints, coatings & bonding', true::boolean),
  ('Metalshield QD Enamel Topcoat', 'Dulux Protective Coatings', '3', '', 'III', '1263', false, null, 'Flammable liquid', 'Paints, coatings & bonding', true::boolean),
  ('371-Line Metalshield QD Enamel Tint Bases', 'Dulux Protective Coatings', '3', '', 'III', '1263', false, null, 'Flammable liquid', 'Paints, coatings & bonding', true::boolean),
  ('366-Line Metalshield Quick Dry Primer', 'Dulux Protective Coatings', '3', '', 'III', '1263', false, null, 'Flammable liquid', 'Paints, coatings & bonding', true::boolean),
  ('462-Line Metalshield Etch Primer', 'Dulux Protective Coatings', '3', '', 'II', '1263', false, null, 'Flammable liquid', 'Paints, coatings & bonding', true::boolean),
  ('466-Line Metalshield Etch Primer', 'Dulux Protective Coatings', '3', '', 'II', '1263', false, null, 'Flammable liquid', 'Paints, coatings & bonding', true::boolean),
  ('Durofast Enamel Aus', 'Durofast / Industrial', '3', '', 'III', '1263', false, null, 'Flammable liquid', 'Paints, coatings & bonding', true::boolean),
  ('HiChem Quick Super Dry Enamel', 'HiChem Paints', '3', '', 'III', '1263', false, null, 'Flammable liquid', 'Paints, coatings & bonding', true::boolean),
  ('Protec 304 QD Enamel Mixed Colour', 'PPG Industries / Protec', '3', '', 'III', '1263', false, null, 'Flammable liquid', 'Paints, coatings & bonding', true::boolean),
  ('Finish 1 2K HS Hardener FH411', 'Sherwin-Williams / Finish 1', '3', '8', null, '1263', false, null, 'Flammable liquid, corrosive', 'Paints, coatings & bonding', true::boolean),
  ('Tip Top Hardener E40', 'REMA Tip Top Australia', '3', '', 'II', '1133', false, null, 'Flammable liquid', 'Paints, coatings & bonding', true::boolean),
  ('Flex-Lag Adhesive Conti Secur BFA', 'Continental / Flexco', '3', '', 'II', '1133', false, null, 'Flammable liquid', 'Paints, coatings & bonding', true::boolean),
  ('Tip Top Cement SC 4000 (White/Green)', 'REMA Tip Top Australia', '3', '', 'II', '1133', false, null, 'Flammable liquid', 'Paints, coatings & bonding', true::boolean),
  ('Tip Top Cement SC 2000 Black', 'REMA Tip Top Australia', '6.1', '', null, '1897', false, null, 'Toxic, solvent based', 'Paints, coatings & bonding', true::boolean),
  ('Tip Top UT-R20 Hardener', 'REMA Tip Top Australia', '3', '', 'II', '1993', false, null, 'Flammable liquid', 'Paints, coatings & bonding', true::boolean),
  ('Tip Top Verstärker RE (Hardener)', 'REMA Tip Top Australia', '3', '', 'II', '1133', false, null, 'Flammable liquid', 'Paints, coatings & bonding', true::boolean),
  ('Megapoxy HICB – Part A (Resin)', 'Vivacity Engineering', '9', '', 'III', '3082', false, null, 'Skin Sens. 1, Eye Irrit. 2A, environmentally hazardous', 'Chemicals, adhesives & reagents', true::boolean),
  ('Megapoxy HICB – Part B (Hardener)', 'Vivacity Engineering', '8', '', 'II', '2735', false, null, 'Skin Corr. 1B, Eye Dam. 1', 'Chemicals, adhesives & reagents', true::boolean),
  ('Castrol Brake Fluid DOT 4', 'Castrol Australia', null, '', null, null, false, null, 'Eye Dam. 1, Repr. 2', 'Chemicals, adhesives & reagents', true::boolean),
  ('CAT Cooling System Cleaner (SDS 1 & 2)', 'Caterpillar', null, '', null, null, false, null, 'Eye irritant (acid)', 'Chemicals, adhesives & reagents', true::boolean),
  ('Delo ELC Antifreeze-Coolant Premix', 'Caltex / Chevron', null, '', null, null, false, null, 'Acute Tox. 4 (ethylene glycol)', 'Chemicals, adhesives & reagents', true::boolean),
  ('Loctite 263 High Strength Threadlocker', 'Henkel Australia', null, '', null, null, false, null, 'Skin Sens. 1, Eye Dam. 1', 'Chemicals, adhesives & reagents', true::boolean),
  ('Soudal T-Rex Power Crystal Adhesive', 'Soudal', null, '', null, null, false, null, 'Polymer (low hazard)', 'Chemicals, adhesives & reagents', null::boolean),
  ('Trefolex Cutting Compound', 'CRC Industries', null, '', null, null, false, null, 'Metal cutting paste', 'Chemicals, adhesives & reagents', null::boolean),
  ('Cigweld Nozzle Dip Anti-Spatter', 'Cigweld', null, '', null, null, false, null, 'Petroleum jelly base', 'Chemicals, adhesives & reagents', null::boolean),
  ('Apparent Glyphosate Green 360', 'Apparent Pty Ltd', null, '', null, null, false, null, 'Aquatic Chronic 2, Eye Irrit. 2A', 'Chemicals, adhesives & reagents', true::boolean),
  ('All Fleet Plus E900 15W-40', 'Valvoline', null, '', null, null, false, 'C2', 'Combustible liquid C2', 'Oils, hydraulic fluids & greases', null::boolean),
  ('Diesel Extra 15W-40 Engine Oil', 'Valvoline / Gulf Western', null, '', null, null, false, 'C2', 'Combustible liquid C2', 'Oils, hydraulic fluids & greases', null::boolean),
  ('Euromax 10W-40 Engine Oil', 'Euro / Valvoline', null, '', null, null, false, 'C2', 'Combustible liquid C2', 'Oils, hydraulic fluids & greases', null::boolean),
  ('Castrol GXT Diesel 15W-40', 'Castrol Australia', null, '', null, null, false, 'C2', 'Combustible liquid C2', 'Oils, hydraulic fluids & greases', null::boolean),
  ('Castrol GTZ 15W-40 Engine Oil', 'Castrol Australia', null, '', null, null, false, 'C2', 'Combustible liquid C2', 'Oils, hydraulic fluids & greases', null::boolean),
  ('Castrol RX Super 15W-40', 'Castrol Australia', null, '', null, null, false, 'C2', 'Combustible liquid C2', 'Oils, hydraulic fluids & greases', null::boolean),
  ('Scania LDF-3 10W-40 Synthetic Oil', 'Scania / Shell', null, '', null, null, false, 'C2', 'Combustible liquid C2', 'Oils, hydraulic fluids & greases', null::boolean),
  ('CAT DEO 15W-40 Diesel Engine Oil', 'Caterpillar', null, '', null, null, false, 'C2', 'Combustible liquid C2', 'Oils, hydraulic fluids & greases', null::boolean),
  ('CAT TDTO 10W Drive Train Oil', 'Caterpillar', null, '', null, null, false, 'C2', 'Combustible liquid C2', 'Oils, hydraulic fluids & greases', null::boolean),
  ('CAT Transmission Drive Train Oil 30', 'Caterpillar', null, '', null, null, false, 'C2', 'Combustible liquid C2', 'Oils, hydraulic fluids & greases', null::boolean),
  ('Valtorque C4 10W Transmission Oil', 'Valvoline', null, '', null, null, false, 'C2', 'Combustible liquid C2', 'Oils, hydraulic fluids & greases', null::boolean),
  ('Castrol Hyspin AWS 32 Hydraulic Oil', 'Castrol Australia', null, '', null, null, false, 'C2', 'Combustible liquid C2', 'Oils, hydraulic fluids & greases', null::boolean),
  ('Castrol Hyspin AWS 46 Hydraulic Oil', 'Castrol Australia', null, '', null, null, false, 'C2', 'Combustible liquid C2', 'Oils, hydraulic fluids & greases', null::boolean),
  ('Castrol Hyspin AWS 68 Hydraulic Oil', 'Castrol Australia', null, '', null, null, false, 'C2', 'Combustible liquid C2', 'Oils, hydraulic fluids & greases', null::boolean),
  ('Castrol Hyspin AWH-M 68 High VI', 'Castrol Australia', null, '', null, null, false, 'C2', 'Combustible liquid C2', 'Oils, hydraulic fluids & greases', null::boolean),
  ('Hyplex S ISO 68 Hydraulic Oil', 'Valvoline / Hi-Tec', null, '', null, null, false, 'C2', 'Combustible liquid C2', 'Oils, hydraulic fluids & greases', null::boolean),
  ('Ultramax 46 Hydraulic Oil', 'Valvoline', null, '', null, null, false, 'C2', 'Combustible liquid C2', 'Oils, hydraulic fluids & greases', null::boolean),
  ('Ultramax 68 Hydraulic Oil', 'Valvoline', null, '', null, null, false, 'C2', 'Combustible liquid C2', 'Oils, hydraulic fluids & greases', null::boolean),
  ('EPG 220 Industrial Gear Oil', 'Valvoline', null, '', null, null, false, 'C2', 'Combustible liquid C2', 'Oils, hydraulic fluids & greases', null::boolean),
  ('EPG Industrial Gear Oil 100', 'Valvoline', null, '', null, null, false, 'C2', 'Combustible liquid C2', 'Oils, hydraulic fluids & greases', null::boolean),
  ('Syntegra 220 Synthetic Gear Oil', 'Valvoline', null, '', null, null, false, 'C2', 'Combustible liquid C2', 'Oils, hydraulic fluids & greases', null::boolean),
  ('31.12.0312 Cone Crusher Grease', 'Terex / OEM', null, '', null, null, false, null, 'Grease (non-DG)', 'Oils, hydraulic fluids & greases', null::boolean),
  ('Shell Gadus S2 V100 3 Grease', 'Shell Lubricants', null, '', null, null, false, null, 'Grease (non-DG)', 'Oils, hydraulic fluids & greases', null::boolean),
  ('Castrol Spheerol EPL 2 Grease', 'Castrol Australia', null, '', null, null, false, null, 'Grease (non-DG)', 'Oils, hydraulic fluids & greases', null::boolean),
  ('Duralife Moly Hi-Temp Non-Melt Grease', 'Duralife / AMTECOL', null, '', null, null, false, null, 'Grease (non-DG)', 'Oils, hydraulic fluids & greases', null::boolean),
  ('Moly Bentone High-Temp Grease', 'Generic / Hi-Tec', null, '', null, null, false, null, 'Grease (non-DG)', 'Oils, hydraulic fluids & greases', null::boolean),
  ('Prosuperplant Heavy EP Grease', 'Fuchs / Valvoline', null, '', null, null, false, null, 'Grease (non-DG)', 'Oils, hydraulic fluids & greases', null::boolean),
  ('Valplex EP Grease (Cartridges & Pails)', 'Valvoline', null, '', null, null, false, null, 'Grease (non-DG)', 'Oils, hydraulic fluids & greases', null::boolean)
) as v(name, manufacturer, dg_class, subsidiary, packing_group, un_number, aerosol, combustible, hazard_summary, section, ghs_hazardous)
where not exists (select 1 from public.whs_chemicals c where lower(c.name) = lower(v.name));

-- Where each product is kept. Burpengary starts with every product, at the Tomago location name (or Somerton's).
insert into public.whs_chem_stock (chemical_id, site_id, location, unit)
select c.id, s.site, s.location, s.unit from (values
  ('BOC Acetylene (Dissolved)', 'tomago', 'Outdoor Cylinder Cage', 'L'),
  ('BOC Acetylene (Dissolved)', 'burpengary', 'Outdoor Cylinder Cage', 'L'),
  ('BOC Argoshield Universal', 'tomago', 'Welding Bay / Rack', 'L'),
  ('BOC Argoshield Universal', 'burpengary', 'Welding Bay / Rack', 'L'),
  ('BOC Oxygen Compressed', 'tomago', 'Outdoor Cylinder Cage', 'L'),
  ('BOC Oxygen Compressed', 'burpengary', 'Outdoor Cylinder Cage', 'L'),
  ('Elgas LPG (Propane)', 'tomago', 'External Cylinder Cage', 'L'),
  ('Elgas LPG (Propane)', 'burpengary', 'External Cylinder Cage', 'L'),
  ('Butane Gas (Cartridges)', 'somerton', 'Tool Store Cabinet', 'L'),
  ('Butane Gas (Cartridges)', 'tomago', 'Tool Store Cabinet', 'L'),
  ('Butane Gas (Cartridges)', 'burpengary', 'Tool Store Cabinet', 'L'),
  ('Automotive Diesel Fuel', 'somerton', 'Yard Bulk Tank / Utes', 'L'),
  ('Automotive Diesel Fuel', 'tomago', 'Yard Bulk Tank / Plant', 'L'),
  ('Automotive Diesel Fuel', 'burpengary', 'Yard Bulk Tank / Plant', 'L'),
  ('Unleaded Petrol (ULP)', 'somerton', 'Flammable Cabinet', 'L'),
  ('Unleaded Petrol (ULP)', 'tomago', 'Flammables Store', 'L'),
  ('Unleaded Petrol (ULP)', 'burpengary', 'Flammables Store', 'L'),
  ('Weld Guard Heavy Duty Anti-Spatter', 'tomago', 'Welding & Fab Bay', 'L'),
  ('Weld Guard Heavy Duty Anti-Spatter', 'burpengary', 'Welding & Fab Bay', 'L'),
  ('CRC Brakleen Parts Cleaner', 'somerton', 'Workshop Wash Bay', 'L'),
  ('CRC Brakleen Parts Cleaner', 'tomago', 'Workshop Wash Bay', 'L'),
  ('CRC Brakleen Parts Cleaner', 'burpengary', 'Workshop Wash Bay', 'L'),
  ('CRC Lectra Shield Aerosol', 'somerton', 'Electrical Bench Cabinet', 'L'),
  ('CRC Lectra Shield Aerosol', 'tomago', 'Electrical Bench Store', 'L'),
  ('CRC Lectra Shield Aerosol', 'burpengary', 'Electrical Bench Store', 'L'),
  ('CRC Multi-purpose Lubricant', 'somerton', 'Workshop Benches', 'L'),
  ('CRC Multi-purpose Lubricant', 'tomago', 'Fitters'' Benches', 'L'),
  ('CRC Multi-purpose Lubricant', 'burpengary', 'Fitters'' Benches', 'L'),
  ('Power Lube Multi-purpose Lubricant', 'somerton', 'Workshop Benches', 'L'),
  ('Power Lube Multi-purpose Lubricant', 'tomago', 'Fitters'' Benches', 'L'),
  ('Power Lube Multi-purpose Lubricant', 'burpengary', 'Fitters'' Benches', 'L'),
  ('Galmet Spraypaint Primer Aerosol', 'somerton', 'Flammable Cabinet', 'L'),
  ('Galmet Spraypaint Primer Aerosol', 'tomago', 'Flammable Cabinet', 'L'),
  ('Galmet Spraypaint Primer Aerosol', 'burpengary', 'Flammable Cabinet', 'L'),
  ('GPI 1K Fillclean Aerosol Cans', 'tomago', 'Paint Store Cabinet', 'L'),
  ('GPI 1K Fillclean Aerosol Cans', 'burpengary', 'Paint Store Cabinet', 'L'),
  ('Seymour Spray Paint (16-3395)', 'tomago', 'Paint Store Cabinet', 'L'),
  ('Seymour Spray Paint (16-3395)', 'burpengary', 'Paint Store Cabinet', 'L'),
  ('Signet Line Marking Paint Yellow', 'tomago', 'Yard Store / Shed', 'L'),
  ('Signet Line Marking Paint Yellow', 'burpengary', 'Yard Store / Shed', 'L'),
  ('U-Pol CCUP-AL Clearcoat Aerosol', 'tomago', 'Paint Store Cabinet', 'L'),
  ('U-Pol CCUP-AL Clearcoat Aerosol', 'burpengary', 'Paint Store Cabinet', 'L'),
  ('Methylated Spirits v10', 'tomago', 'Flammable Cabinet', 'L'),
  ('Methylated Spirits v10', 'burpengary', 'Flammable Cabinet', 'L'),
  ('Mineral Turpentine v8', 'tomago', 'Flammable Cabinet', 'L'),
  ('Mineral Turpentine v8', 'burpengary', 'Flammable Cabinet', 'L'),
  ('Superglow Multipurpose Thinner', 'somerton', 'Flammable Cabinet', 'L'),
  ('Superglow Multipurpose Thinner', 'tomago', 'Flammable Cabinet', 'L'),
  ('Superglow Multipurpose Thinner', 'burpengary', 'Flammable Cabinet', 'L'),
  ('Metalshield Spray Thinner (965-H0009)', 'tomago', 'Paint Store Cabinet', 'L'),
  ('Metalshield Spray Thinner (965-H0009)', 'burpengary', 'Paint Store Cabinet', 'L'),
  ('Workshop Degreaser (Solvent base)', 'tomago', 'Wash Bay / Bunded Store', 'L'),
  ('Workshop Degreaser (Solvent base)', 'burpengary', 'Wash Bay / Bunded Store', 'L'),
  ('Galmet Rust Paint – Silver', 'somerton', 'Paint Store Cabinet', 'L'),
  ('Galmet Rust Paint – Silver', 'tomago', 'Paint Storage Cabinet', 'L'),
  ('Galmet Rust Paint – Silver', 'burpengary', 'Paint Storage Cabinet', 'L'),
  ('Galmet Rust Paint – All Colours', 'somerton', 'Paint Store Cabinet', 'L'),
  ('Galmet Rust Paint – All Colours', 'tomago', 'Paint Storage Cabinet', 'L'),
  ('Galmet Rust Paint – All Colours', 'burpengary', 'Paint Storage Cabinet', 'L'),
  ('Metalshield QD Enamel Topcoat', 'somerton', 'Paint Store Cabinet', 'L'),
  ('Metalshield QD Enamel Topcoat', 'tomago', 'Paint Storage Cabinet', 'L'),
  ('Metalshield QD Enamel Topcoat', 'burpengary', 'Paint Storage Cabinet', 'L'),
  ('371-Line Metalshield QD Enamel Tint Bases', 'tomago', 'Paint Store Shelving', 'L'),
  ('371-Line Metalshield QD Enamel Tint Bases', 'burpengary', 'Paint Store Shelving', 'L'),
  ('366-Line Metalshield Quick Dry Primer', 'tomago', 'Paint Storage Cabinet', 'L'),
  ('366-Line Metalshield Quick Dry Primer', 'burpengary', 'Paint Storage Cabinet', 'L'),
  ('462-Line Metalshield Etch Primer', 'tomago', 'Paint Storage Cabinet', 'L'),
  ('462-Line Metalshield Etch Primer', 'burpengary', 'Paint Storage Cabinet', 'L'),
  ('466-Line Metalshield Etch Primer', 'tomago', 'Paint Storage Cabinet', 'L'),
  ('466-Line Metalshield Etch Primer', 'burpengary', 'Paint Storage Cabinet', 'L'),
  ('Durofast Enamel Aus', 'tomago', 'Paint Storage Cabinet', 'L'),
  ('Durofast Enamel Aus', 'burpengary', 'Paint Storage Cabinet', 'L'),
  ('HiChem Quick Super Dry Enamel', 'tomago', 'Paint Storage Cabinet', 'L'),
  ('HiChem Quick Super Dry Enamel', 'burpengary', 'Paint Storage Cabinet', 'L'),
  ('Protec 304 QD Enamel Mixed Colour', 'tomago', 'Paint Storage Cabinet', 'L'),
  ('Protec 304 QD Enamel Mixed Colour', 'burpengary', 'Paint Storage Cabinet', 'L'),
  ('Finish 1 2K HS Hardener FH411', 'tomago', 'Paint Chemical Store', 'L'),
  ('Finish 1 2K HS Hardener FH411', 'burpengary', 'Paint Chemical Store', 'L'),
  ('Tip Top Hardener E40', 'tomago', 'Rubber Lining Store', 'L'),
  ('Tip Top Hardener E40', 'burpengary', 'Rubber Lining Store', 'L'),
  ('Flex-Lag Adhesive Conti Secur BFA', 'tomago', 'Conveyor Bay Cabinet', 'L'),
  ('Flex-Lag Adhesive Conti Secur BFA', 'burpengary', 'Conveyor Bay Cabinet', 'L'),
  ('Tip Top Cement SC 4000 (White/Green)', 'tomago', 'Rubber Lining Store', 'L'),
  ('Tip Top Cement SC 4000 (White/Green)', 'burpengary', 'Rubber Lining Store', 'L'),
  ('Tip Top Cement SC 2000 Black', 'tomago', 'Rubber Lining Store', 'L'),
  ('Tip Top Cement SC 2000 Black', 'burpengary', 'Rubber Lining Store', 'L'),
  ('Tip Top UT-R20 Hardener', 'tomago', 'Rubber Lining Store', 'L'),
  ('Tip Top UT-R20 Hardener', 'burpengary', 'Rubber Lining Store', 'L'),
  ('Tip Top Verstärker RE (Hardener)', 'tomago', 'Rubber Lining Store', 'L'),
  ('Tip Top Verstärker RE (Hardener)', 'burpengary', 'Rubber Lining Store', 'L'),
  ('Megapoxy HICB – Part A (Resin)', 'somerton', 'Crusher Backing Bay', 'kg'),
  ('Megapoxy HICB – Part A (Resin)', 'tomago', 'Crusher Backing Bay', 'kg'),
  ('Megapoxy HICB – Part A (Resin)', 'burpengary', 'Crusher Backing Bay', 'kg'),
  ('Megapoxy HICB – Part B (Hardener)', 'somerton', 'Crusher Backing Bay', 'kg'),
  ('Megapoxy HICB – Part B (Hardener)', 'tomago', 'Crusher Backing Bay', 'kg'),
  ('Megapoxy HICB – Part B (Hardener)', 'burpengary', 'Crusher Backing Bay', 'kg'),
  ('Castrol Brake Fluid DOT 4', 'somerton', 'Brake Service Shelf', 'L'),
  ('Castrol Brake Fluid DOT 4', 'tomago', 'Lube Store / Bench', 'L'),
  ('Castrol Brake Fluid DOT 4', 'burpengary', 'Lube Store / Bench', 'L'),
  ('CAT Cooling System Cleaner (SDS 1 & 2)', 'somerton', 'Workshop Chemical Store', 'L'),
  ('CAT Cooling System Cleaner (SDS 1 & 2)', 'tomago', 'Workshop Store Shelf', 'L'),
  ('CAT Cooling System Cleaner (SDS 1 & 2)', 'burpengary', 'Workshop Store Shelf', 'L'),
  ('Delo ELC Antifreeze-Coolant Premix', 'somerton', 'Bunded Coolant Pallet', 'L'),
  ('Delo ELC Antifreeze-Coolant Premix', 'tomago', 'Bunded Coolant Pallet', 'L'),
  ('Delo ELC Antifreeze-Coolant Premix', 'burpengary', 'Bunded Coolant Pallet', 'L'),
  ('Loctite 263 High Strength Threadlocker', 'somerton', 'Fitters'' Benches / Kits', 'L'),
  ('Loctite 263 High Strength Threadlocker', 'tomago', 'Fitters'' Tool Kits', 'L'),
  ('Loctite 263 High Strength Threadlocker', 'burpengary', 'Fitters'' Tool Kits', 'L'),
  ('Soudal T-Rex Power Crystal Adhesive', 'somerton', 'Workshop Store Shelf', 'L'),
  ('Soudal T-Rex Power Crystal Adhesive', 'tomago', 'Workshop Store Shelf', 'L'),
  ('Soudal T-Rex Power Crystal Adhesive', 'burpengary', 'Workshop Store Shelf', 'L'),
  ('Trefolex Cutting Compound', 'somerton', 'Machining / Drill Bay', 'L'),
  ('Trefolex Cutting Compound', 'tomago', 'Machining / Drill Bay', 'L'),
  ('Trefolex Cutting Compound', 'burpengary', 'Machining / Drill Bay', 'L'),
  ('Cigweld Nozzle Dip Anti-Spatter', 'somerton', 'Welding & Fab Bay', 'L'),
  ('Cigweld Nozzle Dip Anti-Spatter', 'tomago', 'Welding & Fab Bay', 'L'),
  ('Cigweld Nozzle Dip Anti-Spatter', 'burpengary', 'Welding & Fab Bay', 'L'),
  ('Apparent Glyphosate Green 360', 'tomago', 'Yard Grounds Store', 'L'),
  ('Apparent Glyphosate Green 360', 'burpengary', 'Yard Grounds Store', 'L'),
  ('All Fleet Plus E900 15W-40', 'somerton', 'Lube Bay – 205 L drum', 'L'),
  ('All Fleet Plus E900 15W-40', 'tomago', 'Lube Bay – 205 L drum', 'L'),
  ('All Fleet Plus E900 15W-40', 'burpengary', 'Lube Bay – 205 L drum', 'L'),
  ('Diesel Extra 15W-40 Engine Oil', 'somerton', 'Lube Bay – 205 L drum', 'L'),
  ('Diesel Extra 15W-40 Engine Oil', 'tomago', 'Lube Bay – 205 L drum', 'L'),
  ('Diesel Extra 15W-40 Engine Oil', 'burpengary', 'Lube Bay – 205 L drum', 'L'),
  ('Euromax 10W-40 Engine Oil', 'somerton', 'Lube Bay – 205 L drum', 'L'),
  ('Euromax 10W-40 Engine Oil', 'tomago', 'Lube Bay – 205 L drum', 'L'),
  ('Euromax 10W-40 Engine Oil', 'burpengary', 'Lube Bay – 205 L drum', 'L'),
  ('Castrol GXT Diesel 15W-40', 'somerton', 'Lube Bay – 20 L pails', 'L'),
  ('Castrol GXT Diesel 15W-40', 'tomago', 'Lube Bay – 20 L pails', 'L'),
  ('Castrol GXT Diesel 15W-40', 'burpengary', 'Lube Bay – 20 L pails', 'L'),
  ('Castrol GTZ 15W-40 Engine Oil', 'tomago', 'Lube Bay – 205 L drum', 'L'),
  ('Castrol GTZ 15W-40 Engine Oil', 'burpengary', 'Lube Bay – 205 L drum', 'L'),
  ('Castrol RX Super 15W-40', 'somerton', 'Lube Bay – 205 L drum', 'L'),
  ('Castrol RX Super 15W-40', 'tomago', 'Lube Bay – 205 L drum', 'L'),
  ('Castrol RX Super 15W-40', 'burpengary', 'Lube Bay – 205 L drum', 'L'),
  ('Scania LDF-3 10W-40 Synthetic Oil', 'somerton', 'Lube Store – 205 L drum', 'L'),
  ('Scania LDF-3 10W-40 Synthetic Oil', 'tomago', 'Lube Bay – 205 L drum', 'L'),
  ('Scania LDF-3 10W-40 Synthetic Oil', 'burpengary', 'Lube Bay – 205 L drum', 'L'),
  ('CAT DEO 15W-40 Diesel Engine Oil', 'somerton', 'Lube Store – 205 L drum', 'L'),
  ('CAT DEO 15W-40 Diesel Engine Oil', 'tomago', 'Lube Bay – 205 L drum', 'L'),
  ('CAT DEO 15W-40 Diesel Engine Oil', 'burpengary', 'Lube Bay – 205 L drum', 'L'),
  ('CAT TDTO 10W Drive Train Oil', 'somerton', 'Lube Bay – 205 L drum', 'L'),
  ('CAT TDTO 10W Drive Train Oil', 'tomago', 'Lube Bay – 205 L drum', 'L'),
  ('CAT TDTO 10W Drive Train Oil', 'burpengary', 'Lube Bay – 205 L drum', 'L'),
  ('CAT Transmission Drive Train Oil 30', 'somerton', 'Lube Bay – 205 L drum', 'L'),
  ('CAT Transmission Drive Train Oil 30', 'tomago', 'Lube Bay – 205 L drum', 'L'),
  ('CAT Transmission Drive Train Oil 30', 'burpengary', 'Lube Bay – 205 L drum', 'L'),
  ('Valtorque C4 10W Transmission Oil', 'somerton', 'Lube Bay – 205 L drum', 'L'),
  ('Valtorque C4 10W Transmission Oil', 'tomago', 'Lube Bay – 205 L drum', 'L'),
  ('Valtorque C4 10W Transmission Oil', 'burpengary', 'Lube Bay – 205 L drum', 'L'),
  ('Castrol Hyspin AWS 32 Hydraulic Oil', 'somerton', 'Bunded Lube Pallet', 'L'),
  ('Castrol Hyspin AWS 32 Hydraulic Oil', 'tomago', 'Bunded Lube Pallet', 'L'),
  ('Castrol Hyspin AWS 32 Hydraulic Oil', 'burpengary', 'Bunded Lube Pallet', 'L'),
  ('Castrol Hyspin AWS 46 Hydraulic Oil', 'somerton', 'Bunded Lube Pallet', 'L'),
  ('Castrol Hyspin AWS 46 Hydraulic Oil', 'tomago', 'Bunded Lube Pallet', 'L'),
  ('Castrol Hyspin AWS 46 Hydraulic Oil', 'burpengary', 'Bunded Lube Pallet', 'L'),
  ('Castrol Hyspin AWS 68 Hydraulic Oil', 'somerton', 'Bunded Lube Pallet', 'L'),
  ('Castrol Hyspin AWS 68 Hydraulic Oil', 'tomago', 'Bunded Lube Pallet', 'L'),
  ('Castrol Hyspin AWS 68 Hydraulic Oil', 'burpengary', 'Bunded Lube Pallet', 'L'),
  ('Castrol Hyspin AWH-M 68 High VI', 'somerton', 'Bunded Lube Pallet', 'L'),
  ('Castrol Hyspin AWH-M 68 High VI', 'tomago', 'Bunded Lube Pallet', 'L'),
  ('Castrol Hyspin AWH-M 68 High VI', 'burpengary', 'Bunded Lube Pallet', 'L'),
  ('Hyplex S ISO 68 Hydraulic Oil', 'somerton', 'Bunded Lube Pallet', 'L'),
  ('Hyplex S ISO 68 Hydraulic Oil', 'tomago', 'Bunded Lube Pallet', 'L'),
  ('Hyplex S ISO 68 Hydraulic Oil', 'burpengary', 'Bunded Lube Pallet', 'L'),
  ('Ultramax 46 Hydraulic Oil', 'somerton', 'Bunded Lube Pallet', 'L'),
  ('Ultramax 46 Hydraulic Oil', 'tomago', 'Bunded Lube Pallet', 'L'),
  ('Ultramax 46 Hydraulic Oil', 'burpengary', 'Bunded Lube Pallet', 'L'),
  ('Ultramax 68 Hydraulic Oil', 'somerton', 'Bunded Lube Pallet', 'L'),
  ('Ultramax 68 Hydraulic Oil', 'tomago', 'Bunded Lube Pallet', 'L'),
  ('Ultramax 68 Hydraulic Oil', 'burpengary', 'Bunded Lube Pallet', 'L'),
  ('EPG 220 Industrial Gear Oil', 'somerton', 'Lube Bay – 205 L drum', 'L'),
  ('EPG 220 Industrial Gear Oil', 'tomago', 'Lube Bay – 205 L drum', 'L'),
  ('EPG 220 Industrial Gear Oil', 'burpengary', 'Lube Bay – 205 L drum', 'L'),
  ('EPG Industrial Gear Oil 100', 'somerton', 'Lube Bay – 20 L pails', 'L'),
  ('EPG Industrial Gear Oil 100', 'tomago', 'Lube Bay – 20 L pails', 'L'),
  ('EPG Industrial Gear Oil 100', 'burpengary', 'Lube Bay – 20 L pails', 'L'),
  ('Syntegra 220 Synthetic Gear Oil', 'somerton', 'Lube Bay – 20 L pails', 'L'),
  ('Syntegra 220 Synthetic Gear Oil', 'tomago', 'Lube Bay – 20 L pails', 'L'),
  ('Syntegra 220 Synthetic Gear Oil', 'burpengary', 'Lube Bay – 20 L pails', 'L'),
  ('31.12.0312 Cone Crusher Grease', 'tomago', 'Crusher Workshop Bay', 'kg'),
  ('31.12.0312 Cone Crusher Grease', 'burpengary', 'Crusher Workshop Bay', 'kg'),
  ('Shell Gadus S2 V100 3 Grease', 'somerton', 'Grease Dispenser Rack', 'kg'),
  ('Shell Gadus S2 V100 3 Grease', 'tomago', 'Grease Dispenser Rack', 'kg'),
  ('Shell Gadus S2 V100 3 Grease', 'burpengary', 'Grease Dispenser Rack', 'kg'),
  ('Castrol Spheerol EPL 2 Grease', 'somerton', 'Workshop Grease Bay', 'kg'),
  ('Castrol Spheerol EPL 2 Grease', 'tomago', 'Workshop Grease Bay', 'kg'),
  ('Castrol Spheerol EPL 2 Grease', 'burpengary', 'Workshop Grease Bay', 'kg'),
  ('Duralife Moly Hi-Temp Non-Melt Grease', 'somerton', 'Workshop Grease Bay', 'kg'),
  ('Duralife Moly Hi-Temp Non-Melt Grease', 'tomago', 'Workshop Grease Bay', 'kg'),
  ('Duralife Moly Hi-Temp Non-Melt Grease', 'burpengary', 'Workshop Grease Bay', 'kg'),
  ('Moly Bentone High-Temp Grease', 'somerton', 'Workshop Grease Bay', 'kg'),
  ('Moly Bentone High-Temp Grease', 'tomago', 'Workshop Grease Bay', 'kg'),
  ('Moly Bentone High-Temp Grease', 'burpengary', 'Workshop Grease Bay', 'kg'),
  ('Prosuperplant Heavy EP Grease', 'somerton', 'Workshop Grease Bay', 'kg'),
  ('Prosuperplant Heavy EP Grease', 'burpengary', 'Workshop Grease Bay', 'kg'),
  ('Valplex EP Grease (Cartridges & Pails)', 'somerton', 'Workshop Grease Bay', 'kg'),
  ('Valplex EP Grease (Cartridges & Pails)', 'burpengary', 'Workshop Grease Bay', 'kg')
) as s(name, site, location, unit)
join public.whs_chemicals c on lower(c.name) = lower(s.name)
where not exists (select 1 from public.whs_chem_stock k where k.chemical_id = c.id and k.site_id = s.site and k.location = s.location);

commit;

-- CHECK IT WORKED (optional):
--   select s.name, count(*) as stored_items from public.whs_chem_stock k join public.whs_sites s on s.id = k.site_id group by s.name;
--   -- expect Burpengary Yard 77, Somerton Workshop 47, Tomago Site 75
