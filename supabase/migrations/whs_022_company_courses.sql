-- whs_022_company_courses.sql
-- 1. A per-person list of company-wide courses they do not need to do (sales staff, Townsville and Gold Coast field staff).
-- 2. Records the Fire EMT "Occupant Evacuation & First Response Procedures" completions (29 people) as
--    "Fire extinguisher training" tickets: issued on the completion date, expiring 12 months later.
-- Safe to run more than once. People are matched on name (capitals ignored). Completions seen on the Fire EMT
-- enrolment list on 16/11/2026 (from 1/8/2025); anyone not on that list has no ticket yet.

alter table public.whs_people add column if not exists not_required text[] not null default '{}';

insert into public.whs_person_tickets (person_id, name, issued_on, expires_on, provider, notes, created_by_name)
select p.id, 'Fire extinguisher training', c.done_on, (c.done_on + interval '12 months')::date, 'Fire EMT',
       'Occupant Evacuation & First Response Procedures (Fire EMT online). Loaded from the Fire EMT enrolment list 16/11/2026.', 'Fire EMT import 16/11/2026'
from (values
  ('Mathew Smith', date '2026-07-06'),
  ('Nicholas Close', date '2026-06-22'),
  ('Mark Blackwell', date '2026-06-22'),
  ('Michael Shapland', date '2026-06-19'),
  ('Megan Bennett', date '2026-06-19'),
  ('Elias Franks', date '2026-06-19'),
  ('Craig Johns', date '2026-06-18'),
  ('Nick Thomson', date '2026-06-18'),
  ('Travis Franks', date '2026-06-18'),
  ('Gerard Grigson', date '2026-06-18'),
  ('Samuel Brooks', date '2026-06-18'),
  ('Phelim Gartland', date '2026-06-18'),
  ('Anthony Crawford', date '2026-06-18'),
  ('Jacob Young', date '2026-06-18'),
  ('Rebecca Kassabian', date '2026-06-18'),
  ('Garth Bygate', date '2026-06-17'),
  ('Darryl Harper', date '2026-06-05'),
  ('Harrison Kennan', date '2026-06-05'),
  ('Jaylamont Upoko-Rino', date '2026-06-05'),
  ('Darryn Grabbe', date '2026-06-05'),
  ('Greg Gillett', date '2026-06-05'),
  ('Grant Summers', date '2026-06-05'),
  ('Michael Grainger', date '2026-06-04'),
  ('Aaron Parkes', date '2026-06-04'),
  ('Stan Zdebski', date '2026-06-03'),
  ('Craig Wallace', date '2026-06-03'),
  ('Kirsty Butterworth', date '2026-06-03'),
  ('Brooke Sampson', date '2026-06-03'),
  ('Daniel Sykes', date '2026-06-03')
) as c(name, done_on)
join public.whs_people p on lower(trim(p.name)) = lower(c.name)
where not exists (select 1 from public.whs_person_tickets t where t.person_id = p.id and lower(t.name) = 'fire extinguisher training' and t.issued_on = c.done_on);

update public.whs_people p
set not_required = array_append(p.not_required, 'Fire extinguisher training')
from (values
  ('Brad Scott'),
  ('Jurgen Urbano'),
  ('Hannan Alam'),
  ('Ranjit Padda'),
  ('Justin Guilfoyle'),
  ('Marc Whitton')
) as s(name)
where lower(trim(p.name)) = lower(s.name) and not ('Fire extinguisher training' = any (p.not_required));

notify pgrst, 'reload schema';
