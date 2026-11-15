-- whs_021_load_headcount.sql
-- Loads the staff from the payroll headcount report of 16/11/2026 as people (54 names, TEST ACCOUNT left out).
-- Safe to run more than once. Someone already in the list (matched on name, ignoring capitals) is not duplicated:
-- they only get a site, position, start date and notes filled in where those were empty.
-- Site: Burpengary, Gold Coast and Townsville staff go to Burpengary (they report to Brisbane); NSW to Tomago; VIC to Somerton.
-- First aider and fire warden are ticked from the payroll Groups (First Aiders, Fire Wardens). Cover on the Training page
-- still needs each first aider's first aid and CPR tickets entered on their file.

with src(name, position, site_id, start_date, notes, is_first_aider, is_fire_warden) as (values
  ('Aaron Parkes', 'Service Fitter', 'tomago', date '2022-06-27', 'Worker code AA1000.', false, false),
  ('Alexander Abela', 'Painter', 'burpengary', date '2020-08-31', 'Worker code AL1006.', false, false),
  ('Alex Dyer', 'Fitter', 'burpengary', date '2026-09-01', '', false, false),
  ('Anthony Crawford', 'Service Fitter', 'somerton', date '2026-01-05', 'Worker code AN1122.', false, false),
  ('Brad Scott', 'Area Sales Manager', 'tomago', date '2018-09-25', 'Worker code BR1071.', false, false),
  ('Brooke Sampson', 'Service Admin', 'burpengary', date '2021-08-16', 'Worker code BR1009.', true, false),
  ('Craig Johns', 'VIC Service Manager', 'somerton', date '2008-08-25', 'Worker code CR1041.', false, false),
  ('Craig Wallace', 'NSW Service Manager', 'tomago', date '2018-11-19', 'Worker code CR1002.', true, false),
  ('Damon Ratana', 'Workshop Fitter', 'burpengary', date '2018-11-30', 'Worker code DA1010.', true, false),
  ('Dana Hutchinson', 'Workshop Fitter', 'burpengary', date '2026-03-16', '', false, false),
  ('Daniel Sykes', 'Safety Officer', 'burpengary', date '2025-12-01', 'Worker code DA1121.', true, false),
  ('Darryl Harper', 'Parts Interpreter', 'burpengary', date '2025-04-07', 'Worker code DA1104.', false, false),
  ('Darryn Grabbe', 'Parts Dispatch', 'burpengary', date '2022-02-21', 'Worker code DA1012.', false, false),
  ('Dimitri Halikos', 'Director', 'burpengary', date '1992-11-23', 'Worker code DI1013.', false, false),
  ('Elias Franks', 'Workshop Fitter', 'tomago', date '2025-11-17', 'Worker code EL1118.', false, false),
  ('Fred Brosig', 'Service Fitter', 'somerton', date '2026-09-07', '', false, false),
  ('Garth Bygate', 'Accountant', 'burpengary', date '2010-04-18', 'Worker code GA1014.', false, true),
  ('Gerard Grigson', 'Director', 'burpengary', date '2003-07-21', 'Worker code GE1015.', false, false),
  ('Grant Summers', 'Parts Interpreter', 'burpengary', date '2025-09-29', 'Worker code GR1115.', false, false),
  ('Greg Gillett', 'Parts Interpreter', 'burpengary', date '2026-02-09', '', false, false),
  ('Hannan Alam', 'Area Sales Manager', 'somerton', date '2008-09-29', 'Worker code HA1042.', false, false),
  ('Harrison Kennan', 'Parts Dispatch', 'burpengary', date '2024-05-07', 'Worker code HA1083.', false, false),
  ('Jacob Young', 'Parts Purchasing', 'burpengary', date '2017-09-04', 'Worker code JA1017.', false, false),
  ('Jaylamont Upoko-Rino', 'Parts Dispatch', 'burpengary', date '2025-03-24', 'Worker code JA1102.', true, false),
  ('Joseph Houghton', 'Boilermaker', 'burpengary', date '2026-01-05', 'Worker code JO1123.', false, false),
  ('Jurgen Urbano', 'Area Sales Manager', 'tomago', date '2014-01-20', 'Worker code JU1003.', false, false),
  ('Justin Guilfoyle', 'Area Sales Manager', 'burpengary', date '2016-08-05', 'Worker code JU1019. Field service, reports to Brisbane (Gold Coast).', false, false),
  ('Justin Payne', 'Parts Interpreter', 'burpengary', date '2020-04-24', '', false, true),
  ('Kirk Frost', 'Workshop Fitter', 'burpengary', date '2022-07-05', 'Worker code KI1023.', false, false),
  ('Kirsty Butterworth', 'Administration Officer', 'burpengary', date '2026-02-02', '', false, false),
  ('Marc Whitton', 'NQ Service Fitter', 'burpengary', date '2022-06-13', 'Worker code MA1024. Field service, reports to Brisbane (Townsville).', true, false),
  ('Mark Blackwell', 'Service Fitter', 'burpengary', date '2015-04-13', 'Worker code MA1025.', false, false),
  ('Mathew Smith', 'QLD Service Manager', 'burpengary', date '2012-04-23', 'Worker code MA1027.', false, true),
  ('Megan Bennett', 'Assistant Accountant', 'burpengary', date '2021-10-28', 'Worker code ME1030.', false, false),
  ('Michael Grainger', 'General Manager Parts', 'burpengary', date '2021-03-22', 'Worker code MI1031.', false, false),
  ('Michael Shapland', 'Parts Interpreter', 'burpengary', date '2025-04-14', 'Worker code MI1103.', false, false),
  ('Nathan Cummings', 'Service Fitter', 'burpengary', date '2024-06-12', 'Worker code NA1084.', false, false),
  ('Nicholas Close', 'Service Fitter', 'burpengary', date '2025-04-24', 'Worker code NI1105.', false, false),
  ('Nick Thomson', 'Workshop Fitter', 'tomago', date '2026-01-13', 'Worker code NI1124.', false, false),
  ('Phelim Gartland', 'Service Fitter', 'somerton', date '2024-11-11', 'Worker code PH1093.', false, false),
  ('Ranjit Padda', 'Area Sales Manager', 'somerton', date '2025-11-17', 'Worker code RA1119.', false, false),
  ('Raymond Butler', 'Leading Hand QLD', 'burpengary', date '2016-11-30', 'Worker code RA1033.', false, false),
  ('Rebecca Kassabian', 'Service Fitter', 'tomago', date '2025-06-23', 'Worker code RE1109.', false, false),
  ('Rhiannon Williams', 'Administration Officer', 'burpengary', date '2022-04-05', 'Worker code RH1034.', false, false),
  ('Samuel Brooks', 'Service Fitter', 'somerton', date '2025-08-11', 'Worker code SA1112.', false, false),
  ('Shelley Bustard', 'Administration Supervisor', 'burpengary', date '1998-02-16', 'Worker code SH1035.', false, false),
  ('Shona Blackwell', 'Marketing Coordinator', 'burpengary', date '2026-03-30', '', false, false),
  ('Stan Zdebski', 'Parts Dispatch', 'tomago', date '2023-06-19', 'Worker code ST1049.', false, false),
  ('Steven Karadakovski', 'Parts Dispatch', 'somerton', date '2020-02-24', 'Worker code ST1046.', true, true),
  ('Steven Turner', 'Service Fitter', 'burpengary', date '2023-07-20', 'Worker code ST1058.', false, false),
  ('Tam O''Sullivan', 'Administration Officer', 'burpengary', date '2026-11-16', '', false, false),
  ('Travis Franks', 'Workshop Fitter', 'tomago', date '2025-09-22', 'Worker code TR1114.', false, false),
  ('Wayne Jones', 'Technical Support Manager', 'burpengary', date '2008-08-28', 'Worker code WA1101.', false, false),
  ('Zachary Dioth', 'Apprentice Fitter', 'burpengary', date '2023-03-13', 'Worker code ZA1039.', false, false)
), updated as (
  update public.whs_people p set
    site_id = coalesce(p.site_id, s.site_id),
    position = case when p.position = '' then s.position else p.position end,
    start_date = coalesce(p.start_date, s.start_date),
    notes = case when p.notes = '' then s.notes else p.notes end
  from src s
  where lower(trim(p.name)) = lower(s.name)
  returning p.id
)
insert into public.whs_people (name, position, site_id, start_date, notes, is_first_aider, is_fire_warden, warden_role, created_by_name)
select s.name, s.position, s.site_id, s.start_date, s.notes, s.is_first_aider, s.is_fire_warden, case when s.is_fire_warden then 'warden' else '' end, 'Headcount import 16/11/2026'
from src s
where not exists (select 1 from public.whs_people p where lower(trim(p.name)) = lower(s.name));

notify pgrst, 'reload schema';
