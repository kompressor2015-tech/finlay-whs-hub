-- whs_042_certificate_wcc.sql
-- Medical certificates follow the Work capacity certificate (Form 132M) wording:
--   seen_on       date the worker saw the doctor (date of examination)
--   diagnosis     work-related diagnosis
--   treatment     treatment and referrals the doctor set out
--   duties_from   date the capacity applies from (e.g. suitable duties from ...), when different from the start of treatment
-- The existing from_date / to_date are the treatment period, and next_appointment_on is "to be reviewed again on".
-- Safe to run more than once.
begin;
alter table public.whs_claim_certificates add column if not exists seen_on date;
alter table public.whs_claim_certificates add column if not exists diagnosis text not null default '';
alter table public.whs_claim_certificates add column if not exists treatment text not null default '';
alter table public.whs_claim_certificates add column if not exists duties_from date;
commit;
notify pgrst, 'reload schema';
