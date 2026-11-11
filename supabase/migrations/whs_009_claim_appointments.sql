-- WHS app step 9: appointments on a claim (doctor, specialist, physio, psychologist...) with follow-ups,
-- and the date of the next doctor appointment on each medical certificate.
-- Adds one column and one table. WHS officer and admins only, like the rest of the claim. Safe to re-run.

alter table public.whs_claim_certificates add column if not exists next_appointment_on date;

create table if not exists public.whs_claim_appointments (
  id                  uuid primary key default gen_random_uuid(),
  claim_id            uuid not null references public.whs_claims (id) on delete cascade,
  kind                text not null default 'doctor' check (kind in ('doctor', 'specialist', 'physio', 'psychologist', 'assessment', 'other')),
  with_whom           text not null default '',
  on_date             date not null,
  at_time             text not null default '',
  place               text not null default '',
  status              text not null default 'booked' check (status in ('booked', 'attended', 'missed', 'cancelled')),
  outcome             text not null default '',
  follow_up_on        date,
  follow_up_note      text not null default '',
  followed_up_at      timestamptz,
  followed_up_by_name text not null default '',
  created_by_name     text not null default '',
  created_at          timestamptz not null default now()
);
create index if not exists whs_claim_appointments_idx on public.whs_claim_appointments (claim_id, on_date);

drop trigger if exists whs_stamp_created on public.whs_claim_appointments;
create trigger whs_stamp_created before insert or update on public.whs_claim_appointments
  for each row execute function public.whs_stamp_created();

alter table public.whs_claim_appointments enable row level security;
drop policy if exists "whs officer all" on public.whs_claim_appointments;
create policy "whs officer all" on public.whs_claim_appointments for all to authenticated
  using (public.whs_is_officer()) with check (public.whs_is_officer());
grant select, insert, update, delete on public.whs_claim_appointments to authenticated;
