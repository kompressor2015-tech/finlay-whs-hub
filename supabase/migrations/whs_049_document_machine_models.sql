-- whs_049: machine model on documents, spelled as the Fleet Hub model list (machine_models.model_name)
-- One update per document. Only blank models are filled. The last query shows the result.

update public.whs_documents set machine_model = '883+ Spaleck' where doc_type = 'swi' and regexp_replace(doc_no, '[^0-9]', '', 'g') = '055' and coalesce(trim(machine_model), '') = '';
update public.whs_documents set machine_model = '694+ Supertrak / 693 Supertrak' where doc_type = 'swi' and regexp_replace(doc_no, '[^0-9]', '', 'g') = '057' and coalesce(trim(machine_model), '') = '';
update public.whs_documents set machine_model = '683 Supertrak' where doc_type = 'swi' and regexp_replace(doc_no, '[^0-9]', '', 'g') = '058' and coalesce(trim(machine_model), '') = '';
update public.whs_documents set machine_model = 'C-1550' where doc_type = 'swi' and regexp_replace(doc_no, '[^0-9]', '', 'g') = '060' and coalesce(trim(machine_model), '') = '';
update public.whs_documents set machine_model = '984 Horizontal Screen' where doc_type = 'swi' and regexp_replace(doc_no, '[^0-9]', '', 'g') = '062' and coalesce(trim(machine_model), '') = '';
update public.whs_documents set machine_model = 'I-140RS' where doc_type = 'swi' and regexp_replace(doc_no, '[^0-9]', '', 'g') = '063' and coalesce(trim(machine_model), '') = '';
update public.whs_documents set machine_model = 'C-1545P' where doc_type = 'swi' and regexp_replace(doc_no, '[^0-9]', '', 'g') = '064' and coalesce(trim(machine_model), '') = '';
update public.whs_documents set machine_model = 'TC-80' where doc_type = 'swi' and regexp_replace(doc_no, '[^0-9]', '', 'g') = '072' and coalesce(trim(machine_model), '') = '';
update public.whs_documents set machine_model = 'I-120RS' where doc_type = 'swi' and regexp_replace(doc_no, '[^0-9]', '', 'g') = '075' and coalesce(trim(machine_model), '') = '';
update public.whs_documents set machine_model = 'I-140 / I-120RS' where doc_type = 'swi' and regexp_replace(doc_no, '[^0-9]', '', 'g') = '076' and coalesce(trim(machine_model), '') = '';
update public.whs_documents set machine_model = 'C-1550' where doc_type = 'swi' and regexp_replace(doc_no, '[^0-9]', '', 'g') = '081' and coalesce(trim(machine_model), '') = '';
update public.whs_documents set machine_model = 'TDS V20' where doc_type = 'swi' and regexp_replace(doc_no, '[^0-9]', '', 'g') = '083' and coalesce(trim(machine_model), '') = '';
update public.whs_documents set machine_model = 'TDS 820' where doc_type = 'swi' and regexp_replace(doc_no, '[^0-9]', '', 'g') = '084' and coalesce(trim(machine_model), '') = '';
update public.whs_documents set machine_model = 'TTS 620' where doc_type = 'swi' and regexp_replace(doc_no, '[^0-9]', '', 'g') = '085' and coalesce(trim(machine_model), '') = '';
update public.whs_documents set machine_model = 'C-1545P' where doc_type = 'swi' and regexp_replace(doc_no, '[^0-9]', '', 'g') = '090' and coalesce(trim(machine_model), '') = '';
update public.whs_documents set machine_model = 'IC-110RS' where doc_type = 'swi' and regexp_replace(doc_no, '[^0-9]', '', 'g') = '091' and coalesce(trim(machine_model), '') = '';
update public.whs_documents set machine_model = '696 2D Supertrak / 696 3D Supertrak' where doc_type = 'swi' and regexp_replace(doc_no, '[^0-9]', '', 'g') = '092' and coalesce(trim(machine_model), '') = '';
update public.whs_documents set machine_model = '696 2D Supertrak / 696 3D Supertrak' where doc_type = 'swi' and regexp_replace(doc_no, '[^0-9]', '', 'g') = '093' and coalesce(trim(machine_model), '') = '';
update public.whs_documents set machine_model = 'J-1480' where doc_type = 'swi' and regexp_replace(doc_no, '[^0-9]', '', 'g') = '096' and coalesce(trim(machine_model), '') = '';
update public.whs_documents set machine_model = 'C-1550' where doc_type = 'swi' and regexp_replace(doc_no, '[^0-9]', '', 'g') = '097' and coalesce(trim(machine_model), '') = '';
update public.whs_documents set machine_model = 'TTS 620T' where doc_type = 'swi' and regexp_replace(doc_no, '[^0-9]', '', 'g') = '099' and coalesce(trim(machine_model), '') = '';

-- Earlier short forms to the Fleet Hub spelling
update public.whs_documents set machine_model = '683 Supertrak' where machine_model in ('683');
update public.whs_documents set machine_model = '693 Supertrak' where machine_model in ('693');
update public.whs_documents set machine_model = '694+ Supertrak' where machine_model in ('694', '694+');
update public.whs_documents set machine_model = '883+ Spaleck' where machine_model in ('883', '883+');
update public.whs_documents set machine_model = '984 Horizontal Screen' where machine_model in ('984');
update public.whs_documents set machine_model = 'C-1540 / C-1540P' where machine_model in ('C-1540', 'C-1540P');

notify pgrst, 'reload schema';

select doc_no, title, machine_model from public.whs_documents where doc_type = 'swi' and machine_model <> '' order by doc_no;
