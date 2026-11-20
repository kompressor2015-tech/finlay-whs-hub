-- whs_049: machine model on documents, spelled as the Fleet Hub model list (machine_models.model_name)
-- Fills blank models on SWI-055 onward and tidies earlier short forms. Only blank models are filled.

update public.whs_documents d
set machine_model = v.model
from (values
  ('055', '883+ Spaleck'),
  ('057', '694+ Supertrak / 693 Supertrak'),
  ('058', '683 Supertrak'),
  ('060', 'C-1550'),
  ('062', '984 Horizontal Screen'),
  ('063', 'I-140RS'),
  ('064', 'C-1545P'),
  ('072', 'TC-80'),
  ('075', 'I-120RS'),
  ('076', 'I-140 / I-120RS'),
  ('081', 'C-1550'),
  ('083', 'TDS V20'),
  ('084', 'TDS 820'),
  ('085', 'TTS 620'),
  ('090', 'C-1545P'),
  ('091', 'IC-110RS'),
  ('092', '696 2D Supertrak / 696 3D Supertrak'),
  ('093', '696 2D Supertrak / 696 3D Supertrak'),
  ('096', 'J-1480'),
  ('097', 'C-1550'),
  ('099', 'TTS 620T')
) as v(n, model)
where d.doc_type = 'swi'
  and regexp_replace(d.doc_no, '[^0-9]', '', 'g') = v.n
  and coalesce(trim(d.machine_model), '') = '';

-- Earlier short forms to the Fleet Hub spelling
update public.whs_documents set machine_model = '683 Supertrak' where machine_model = '683';
update public.whs_documents set machine_model = '693 Supertrak' where machine_model = '693';
update public.whs_documents set machine_model = '694+ Supertrak' where machine_model in ('694', '694+');
update public.whs_documents set machine_model = '883+ Spaleck' where machine_model in ('883', '883+');
update public.whs_documents set machine_model = '984 Horizontal Screen' where machine_model = '984';
update public.whs_documents set machine_model = 'C-1540 / C-1540P' where machine_model in ('C-1540', 'C-1540P');

notify pgrst, 'reload schema';
