-- Puts the new work instructions (SWI-055 to SWI-099) in the same sections as the earlier ones
-- and tidies a few things found in the audit of the Documents list. Safe to run more than once.
-- Only documents with no section yet are given one, so anything set by hand is left alone.

update public.whs_documents d
set category = x.cat
from (values
    ('055', 'Machine Service SWI'),
    ('056', 'Machine Tasks'),
    ('057', 'Machine Service SWI'),
    ('058', 'Machine Service SWI'),
    ('059', 'Machine Service SWI'),
    ('060', 'Machine Service SWI'),
    ('061', 'Machine Tasks'),
    ('062', 'Machine Service SWI'),
    ('063', 'Crusher and screen changeovers'),
    ('064', 'Crusher and screen changeovers'),
    ('065', 'Machine Tasks'),
    ('066', 'Mobile plant'),
    ('067', 'Hand tools and workshop'),
    ('068', 'Hand tools and workshop'),
    ('069', 'Machine Tasks'),
    ('070', 'Hand tools and workshop'),
    ('071', 'Hand tools and workshop'),
    ('072', 'Machine Service SWI'),
    ('073', 'Hand tools and workshop'),
    ('074', 'Hand tools and workshop'),
    ('075', 'Crusher and screen changeovers'),
    ('076', 'Machine Service SWI'),
    ('077', 'Hand tools and workshop'),
    ('078', 'Work at height'),
    ('079', 'Machine Service SWI'),
    ('080', 'Work at height'),
    ('081', 'Machine Tasks'),
    ('082', 'Work at height'),
    ('083', 'Machine Service SWI'),
    ('084', 'Machine Service SWI'),
    ('085', 'Machine Service SWI'),
    ('086', 'Machine Service SWI'),
    ('087', 'Hand tools and workshop'),
    ('090', 'Machine Tasks'),
    ('091', 'Machine Tasks'),
    ('092', 'Machine Tasks'),
    ('093', 'Machine Tasks'),
    ('094', 'Machine Tasks'),
    ('096', 'Machine Tasks'),
    ('097', 'Crusher and screen changeovers'),
    ('099', 'Machine Service SWI')
) as x(num, cat)
where d.doc_type = 'swi'
  and d.category = ''
  and regexp_replace(d.doc_no, '[^0-9]', '', 'g') = x.num;

-- Tracking Screens 6 Series sat with the changeovers, the other tracking SWIs are Machine Tasks
update public.whs_documents set category = 'Machine Tasks'
where doc_type = 'swi' and doc_no = 'SWI-040' and category = 'Crusher and screen changeovers';

-- The elevated work platform procedure joins the other HSMS procedures
update public.whs_documents set category = 'Procedure'
where doc_type = 'hsms' and doc_no = 'HSMS24-P1' and category = 'Mobile plant';

-- Management system numbers HSMS011 and HSMS016 should read HSMS11 and HSMS16, so they sort in order
update public.whs_documents set doc_no = 'HSMS11'
where doc_type = 'hsms' and doc_no = 'HSMS011'
  and not exists (select 1 from public.whs_documents e where e.doc_type = 'hsms' and e.doc_no = 'HSMS11');
update public.whs_documents set doc_no = 'HSMS16'
where doc_type = 'hsms' and doc_no = 'HSMS016'
  and not exists (select 1 from public.whs_documents e where e.doc_type = 'hsms' and e.doc_no = 'HSMS16');

-- Spelling in a title
update public.whs_documents set title = 'Fatigue Management'
where doc_type = 'hsms' and doc_no = 'HSMS09-P2' and title = 'Fatigue Managment';

notify pgrst, 'reload schema';
