-- WHS app step 10: "No further doctor visits needed" on a medical certificate.
-- When the latest certificate is marked this way, the app stops asking for the next certificate.
-- Adds one column. Safe to re-run.

alter table public.whs_claim_certificates add column if not exists no_further_visits boolean not null default false;

notify pgrst, 'reload schema';
