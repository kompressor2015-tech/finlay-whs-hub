-- Review dates and versions for SWI-054 to SWI-099, taken from the header of each updated Word file.
-- The Documents list works out "Review by" as the last reviewed date plus the review period (12 months).
-- So the last reviewed date is set to one year before each file's own Review Date, which makes
-- "Review by" in the list match the Review Date printed on the SWI.
-- Also fills the version from the file header. Safe to run more than once. SWIs not listed are untouched.

update public.whs_documents d
set reviewed_on = (x.review_date - interval '12 months')::date,
    review_months = 12
from (values
    ('054', date '2027-06-01', '1.3'),
    ('055', date '2027-06-01', '1.3'),
    ('056', date '2027-06-30', '1.3'),
    ('057', date '2027-06-01', '1.2'),
    ('058', date '2027-06-01', '1.3'),
    ('059', date '2027-06-01', '1.3'),
    ('060', date '2027-06-01', '1.2'),
    ('061', date '2027-06-30', '1.3'),
    ('062', date '2027-06-01', '1.3'),
    ('063', date '2027-06-30', '1.3'),
    ('064', date '2027-06-01', '1.3'),
    ('065', date '2027-06-01', '1.3'),
    ('066', date '2027-06-30', '1.3'),
    ('067', date '2027-06-30', '1.2'),
    ('068', date '2027-06-30', '1.3'),
    ('069', date '2027-06-01', '1.3'),
    ('070', date '2027-06-01', '1.3'),
    ('071', date '2027-06-01', '1.3'),
    ('072', date '2027-06-01', '1.2'),
    ('073', date '2027-07-01', '1.3'),
    ('074', date '2027-06-30', '1.3'),
    ('075', date '2027-06-30', '1.2'),
    ('076', date '2027-06-30', '1.3'),
    ('077', date '2027-06-30', '1.2'),
    ('078', date '2027-06-30', '1.3'),
    ('079', date '2027-06-30', '1.1'),
    ('080', date '2027-06-30', '1.2'),
    ('081', date '2027-06-01', '1.3'),
    ('082', date '2027-06-30', '1.2'),
    ('083', date '2027-06-30', '1.0'),
    ('084', date '2027-06-30', '1.0'),
    ('085', date '2027-06-30', '1.0'),
    ('086', date '2027-06-30', '1.0'),
    ('087', date '2027-06-30', '1.0'),
    ('090', date '2027-06-01', '1.0'),
    ('091', date '2027-06-01', '1.3'),
    ('092', date '2027-06-30', '1.0'),
    ('093', date '2027-06-30', '1.0'),
    ('094', date '2027-06-30', '1.0'),
    ('096', date '2027-06-30', '1.0'),
    ('097', date '2027-06-30', '1.0'),
    ('099', date '2027-06-01', '1.0')
) as x(num, review_date, ver)
where d.doc_type = 'swi'
  and regexp_replace(d.doc_no, '[^0-9]', '', 'g') = x.num;

update public.whs_document_versions v
set version = x.ver
from public.whs_documents d,
     (values
    ('054', date '2027-06-01', '1.3'),
    ('055', date '2027-06-01', '1.3'),
    ('056', date '2027-06-30', '1.3'),
    ('057', date '2027-06-01', '1.2'),
    ('058', date '2027-06-01', '1.3'),
    ('059', date '2027-06-01', '1.3'),
    ('060', date '2027-06-01', '1.2'),
    ('061', date '2027-06-30', '1.3'),
    ('062', date '2027-06-01', '1.3'),
    ('063', date '2027-06-30', '1.3'),
    ('064', date '2027-06-01', '1.3'),
    ('065', date '2027-06-01', '1.3'),
    ('066', date '2027-06-30', '1.3'),
    ('067', date '2027-06-30', '1.2'),
    ('068', date '2027-06-30', '1.3'),
    ('069', date '2027-06-01', '1.3'),
    ('070', date '2027-06-01', '1.3'),
    ('071', date '2027-06-01', '1.3'),
    ('072', date '2027-06-01', '1.2'),
    ('073', date '2027-07-01', '1.3'),
    ('074', date '2027-06-30', '1.3'),
    ('075', date '2027-06-30', '1.2'),
    ('076', date '2027-06-30', '1.3'),
    ('077', date '2027-06-30', '1.2'),
    ('078', date '2027-06-30', '1.3'),
    ('079', date '2027-06-30', '1.1'),
    ('080', date '2027-06-30', '1.2'),
    ('081', date '2027-06-01', '1.3'),
    ('082', date '2027-06-30', '1.2'),
    ('083', date '2027-06-30', '1.0'),
    ('084', date '2027-06-30', '1.0'),
    ('085', date '2027-06-30', '1.0'),
    ('086', date '2027-06-30', '1.0'),
    ('087', date '2027-06-30', '1.0'),
    ('090', date '2027-06-01', '1.0'),
    ('091', date '2027-06-01', '1.3'),
    ('092', date '2027-06-30', '1.0'),
    ('093', date '2027-06-30', '1.0'),
    ('094', date '2027-06-30', '1.0'),
    ('096', date '2027-06-30', '1.0'),
    ('097', date '2027-06-30', '1.0'),
    ('099', date '2027-06-01', '1.0')
) as x(num, review_date, ver)
where v.document_id = d.id
  and d.doc_type = 'swi'
  and regexp_replace(d.doc_no, '[^0-9]', '', 'g') = x.num
  and v.version = ''
  and v.id = (select v2.id from public.whs_document_versions v2 where v2.document_id = d.id order by v2.uploaded_at desc limit 1);

notify pgrst, 'reload schema';
