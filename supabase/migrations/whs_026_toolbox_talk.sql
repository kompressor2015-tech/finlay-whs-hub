-- WHS app step 26: toolbox talks are internal and every 2 months (whs_025 set 1 month).
-- Safe to re-run.
begin;
update public.whs_recurring_checks
   set interval_months = 2,
       basis = 'Internal toolbox talk every 2 months, given by our own staff. Record the topic, attach the signed sheet and raise any actions.'
 where lower(name) = 'toolbox talk' and interval_months = 1;
notify pgrst, 'reload schema';
commit;
