-- WHS app step 13: edit a document version's label and give each version an issue date.
-- Adds issued_on to whs_document_versions and lets office staff edit the label and issue date
-- (the file, who uploaded it and when stay fixed). Safe to re-run.

alter table public.whs_document_versions add column if not exists issued_on date;

drop policy if exists "whs office edit document versions" on public.whs_document_versions;
create policy "whs office edit document versions" on public.whs_document_versions for update to authenticated
  using (public.whs_is_office()) with check (public.whs_is_office());

create or replace function public.whs_document_version_lock()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.document_id := old.document_id;
  new.file_path := old.file_path;
  new.file_name := old.file_name;
  new.uploaded_at := old.uploaded_at;
  new.uploaded_by_name := old.uploaded_by_name;
  return new;
end;
$$;
drop trigger if exists whs_document_version_lock on public.whs_document_versions;
create trigger whs_document_version_lock before update on public.whs_document_versions
  for each row execute function public.whs_document_version_lock();

notify pgrst, 'reload schema';
