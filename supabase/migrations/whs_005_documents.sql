-- WHS app, step 5: Documents
-- One library for the management system (HSMS), safe work instructions (SWI), SWMS, machine
-- risk assessments, policies and plans, and forms. Each document has versions (older ones are
-- kept), an owner, who it applies to, and a review date.
--
--   whs_documents          : one row per document
--   whs_document_versions  : one row per uploaded file version
--   storage bucket whs-documents (private)
--
-- Who can do what (same as the chemical register):
--   everyone with WHS access reads and opens documents
--   office roles add documents, change details and upload new versions
--   the WHS officer (and admins) delete
-- Safe to run more than once. Only adds new whs_ objects.

create table if not exists public.whs_documents (
  id               uuid primary key default gen_random_uuid(),
  doc_type         text not null check (doc_type in ('hsms', 'swi', 'swms', 'risk_assessment', 'policy', 'form')),
  doc_no           text not null default '',
  title            text not null check (length(trim(title)) > 0),
  site_id          text references public.whs_sites (id),      -- null = all sites
  machine_model    text not null default '',                   -- the Fleet Hub model it covers, if any
  owner_name       text not null default 'WHS officer',
  review_months    integer not null default 12 check (review_months > 0),
  reviewed_on      date,                                       -- null = no review date yet
  reviewed_by_name text not null default '',
  notes            text not null default '',
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists whs_documents_type_idx on public.whs_documents (doc_type, doc_no);

create table if not exists public.whs_document_versions (
  id               uuid primary key default gen_random_uuid(),
  document_id      uuid not null references public.whs_documents (id) on delete cascade,
  version          text not null default '',
  file_path        text not null,
  file_name        text not null default '',
  uploaded_at      timestamptz not null default now(),
  uploaded_by_name text not null default ''
);
create index if not exists whs_document_versions_idx on public.whs_document_versions (document_id, uploaded_at desc);

-- Stamps: who and when are set by the database, never by the browser.
create or replace function public.whs_document_stamps()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    if new.reviewed_on is distinct from old.reviewed_on then
      new.reviewed_by_name := case when new.reviewed_on is null then '' else public.whs_actor_name() end;
    end if;
  elsif new.reviewed_on is not null then
    new.reviewed_by_name := public.whs_actor_name();
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists whs_document_stamps on public.whs_documents;
create trigger whs_document_stamps before insert or update on public.whs_documents
  for each row execute function public.whs_document_stamps();

create or replace function public.whs_document_version_stamps()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.uploaded_at := now();
  new.uploaded_by_name := public.whs_actor_name();
  return new;
end;
$$;
drop trigger if exists whs_document_version_stamps on public.whs_document_versions;
create trigger whs_document_version_stamps before insert on public.whs_document_versions
  for each row execute function public.whs_document_version_stamps();

-- Access rules
alter table public.whs_documents         enable row level security;
alter table public.whs_document_versions enable row level security;

drop policy if exists "whs read documents" on public.whs_documents;
drop policy if exists "whs office add documents" on public.whs_documents;
drop policy if exists "whs office change documents" on public.whs_documents;
drop policy if exists "whs officer delete documents" on public.whs_documents;
create policy "whs read documents" on public.whs_documents for select to authenticated using (public.whs_is_member());
create policy "whs office add documents" on public.whs_documents for insert to authenticated with check (public.whs_is_office());
create policy "whs office change documents" on public.whs_documents for update to authenticated
  using (public.whs_is_office()) with check (public.whs_is_office());
create policy "whs officer delete documents" on public.whs_documents for delete to authenticated using (public.whs_is_officer());

drop policy if exists "whs read document versions" on public.whs_document_versions;
drop policy if exists "whs office add document versions" on public.whs_document_versions;
drop policy if exists "whs officer delete document versions" on public.whs_document_versions;
create policy "whs read document versions" on public.whs_document_versions for select to authenticated using (public.whs_is_member());
create policy "whs office add document versions" on public.whs_document_versions for insert to authenticated with check (public.whs_is_office());
create policy "whs officer delete document versions" on public.whs_document_versions for delete to authenticated using (public.whs_is_officer());

grant select, insert, update, delete on public.whs_documents, public.whs_document_versions to authenticated;

-- Private store for the files
insert into storage.buckets (id, name, public)
values ('whs-documents', 'whs-documents', false)
on conflict (id) do update set public = false;

drop policy if exists "whs read document files" on storage.objects;
drop policy if exists "whs office upload document files" on storage.objects;
drop policy if exists "whs officer delete document files" on storage.objects;
create policy "whs read document files" on storage.objects for select to authenticated
  using (bucket_id = 'whs-documents' and public.whs_is_member());
create policy "whs office upload document files" on storage.objects for insert to authenticated
  with check (bucket_id = 'whs-documents' and public.whs_is_office());
create policy "whs officer delete document files" on storage.objects for delete to authenticated
  using (bucket_id = 'whs-documents' and public.whs_is_officer());
