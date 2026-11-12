-- WHS app step 12: a "category" on each document, so a long list (54 work instructions) can be
-- shown in headed groups: hand tools and workshop, mobile plant, crusher and screen changeovers.
-- Adds one column, then sorts the existing work instructions by their titles as a first pass.
-- You can change any of them afterwards in the document's details. Safe to re-run.

alter table public.whs_documents add column if not exists category text not null default '';

update public.whs_documents set category = case
  when title ~* '(forklift|ewp|elevated work|loader|excavator|dozer|truck|crane|telehandler|skid|bobcat|grader|roller|water cart|vehicle|trailer|bus)' then 'Mobile plant'
  when title ~* '(change|liner|mesh|blow bar|wedge|cone|jaw|screen|crusher|hopper|conveyor|feeder|deck)' then 'Crusher and screen changeovers'
  when title ~* '(grinder|drill|saw|weld|tool|gas|compressor|lathe|press|jack|washer|cutting|oxy|torch|hammer|spanner|wrench|ladder)' then 'Hand tools and workshop'
  else 'Other'
end
where doc_type = 'swi' and category = '';

notify pgrst, 'reload schema';
