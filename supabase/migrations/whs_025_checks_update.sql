-- WHS app step 25: check intervals confirmed by Finlay, and toolbox talks.
--   First aid supplies: contractor, every 6 months (was a 12 month kit check)
--   Electrical test and tag: every 6 months
--   Racking inspection: yearly (confirmed)
--   Toolbox talk: a monthly check at every site, each talk is a log line
-- Safe to re-run.

begin;

update public.whs_recurring_checks
   set name = 'First aid supplies service', interval_months = 6, rule_confirmed = true,
       basis = 'Contractor checks and restocks the first aid kits every 6 months (Queensland First Aid code: also check after use).'
 where lower(name) = 'first aid kit check';

update public.whs_recurring_checks
   set interval_months = 6, rule_confirmed = true, basis = 'AS/NZS 3760. Done by a contractor every 6 months at Finlay.'
 where lower(name) = 'electrical test and tag';

update public.whs_recurring_checks
   set rule_confirmed = true, basis = 'Annual inspection by a racking contractor.'
 where lower(name) = 'racking inspection';

insert into public.whs_recurring_checks (site_id, name, category, interval_months, basis, rule_confirmed)
select s.id, 'Toolbox talk', 'Safety talks', 1,
       'Monthly site safety talk. Add each talk as a log line: topic in the notes, who gave it, and attach the signed sheet.', false
from public.whs_sites s
where not exists (select 1 from public.whs_recurring_checks c where c.site_id = s.id and lower(c.name) = 'toolbox talk');

notify pgrst, 'reload schema';
commit;
