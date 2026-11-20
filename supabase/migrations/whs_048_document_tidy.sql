-- Document list tidy-up from the audit. Safe to run more than once.

-- 1. HSMS23 LOTO was in the list twice. Keep the first one uploaded and remove the other.
--    (Its file stays in storage unseen. Nothing points to it.)
delete from public.whs_documents
where id in (
  select id from public.whs_documents
  where doc_type = 'hsms' and doc_no = 'HSMS23'
  order by created_at, id
  offset 1
);

-- 2. SWI-040 had its Review By date typed in as the last reviewed date. Review by 01/06/2027 means last reviewed 01/06/2026.
update public.whs_documents set reviewed_on = date '2026-06-01'
where doc_type = 'swi' and doc_no = 'SWI-040' and reviewed_on = date '2027-06-01';

-- 3. One spelling for each machine
update public.whs_documents set machine_model = 'VS350' where machine_model in ('VSI350', 'VSI 350', 'VS 350');
update public.whs_documents set machine_model = 'I-130/RS' where machine_model in ('I130/RS', 'I-130 / RS', 'I130 / RS');
update public.whs_documents set machine_model = 'AC210' where machine_model in ('VSI AC210', 'VSI-AC210', 'AC 210');

notify pgrst, 'reload schema';
