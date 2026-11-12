-- WHS app step 14: a log of every document review.
-- Each review is a line (date, who, a short note) that cannot be edited. The document's
-- "last reviewed" date follows the newest line, so the reminders work as before.
-- Existing review dates are copied in as the first line. Only an administrator can remove a
-- line (for one entered by mistake). Safe to re-run.

create table if not exists public.whs_document_reviews (
  id               uuid primary key default gen_random_uuid(),
  document_id      uuid not null references public.whs_documents (id) on delete cascade,
  reviewed_on      date not null,
  reviewed_by_name text not null default '',
  note             text not null default '',
  created_at       timestamptz not null default now()
);
create index if not exists whs_document_reviews_idx on public.whs_document_reviews (document_id, reviewed_on desc);

create or replace function public.whs_document_review_stamps()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.reviewed_by_name := public.whs_actor_name();
  new.created_at := now();
  return new;
end;
$$;
drop trigger if exists whs_document_review_stamps on public.whs_document_reviews;
create trigger whs_document_review_stamps before insert on public.whs_document_reviews
  for each row execute function public.whs_document_review_stamps();

-- The document's own "last reviewed" follows the newest review line.
create or replace function public.whs_document_review_sync()
returns trigger language plpgsql security definer set search_path = public
as $$
declare d uuid := coalesce(new.document_id, old.document_id);
begin
  update public.whs_documents set reviewed_on = (select max(reviewed_on) from public.whs_document_reviews where document_id = d) where id = d;
  update public.whs_documents set reviewed_by_name = coalesce((select reviewed_by_name from public.whs_document_reviews where document_id = d order by reviewed_on desc, created_at desc limit 1), '') where id = d;
  return null;
end;
$$;
drop trigger if exists whs_document_review_sync on public.whs_document_reviews;
create trigger whs_document_review_sync after insert or delete on public.whs_document_reviews
  for each row execute function public.whs_document_review_sync();

alter table public.whs_document_reviews enable row level security;
drop policy if exists "whs read document reviews" on public.whs_document_reviews;
drop policy if exists "whs office add document reviews" on public.whs_document_reviews;
drop policy if exists "whs admin delete document reviews" on public.whs_document_reviews;
create policy "whs read document reviews" on public.whs_document_reviews for select to authenticated using (public.whs_is_member());
create policy "whs office add document reviews" on public.whs_document_reviews for insert to authenticated with check (public.whs_is_office());
create policy "whs admin delete document reviews" on public.whs_document_reviews for delete to authenticated using (public.whs_is_admin());
revoke update on public.whs_document_reviews from anon, authenticated;
grant select, insert, delete on public.whs_document_reviews to authenticated;

-- Copy today's review dates in as the first line (once)
insert into public.whs_document_reviews (document_id, reviewed_on, reviewed_by_name, note)
select d.id, d.reviewed_on, coalesce(nullif(d.reviewed_by_name, ''), 'Before the log'), 'Review date from before the log started'
from public.whs_documents d
where d.reviewed_on is not null and not exists (select 1 from public.whs_document_reviews r where r.document_id = d.id);

notify pgrst, 'reload schema';
