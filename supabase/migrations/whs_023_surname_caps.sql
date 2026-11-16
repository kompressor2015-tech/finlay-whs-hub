-- whs_023_surname_caps.sql
-- Writes the last word of every person's name in capitals so the surname stands out (Daniel SYKES).
-- Names with one word are left alone. Safe to run more than once.
update public.whs_people p
set name = trim(left(trim(p.name), length(trim(p.name)) - length(substring(trim(p.name) from '(\S+)$')))) || ' ' || upper(substring(trim(p.name) from '(\S+)$'))
where trim(p.name) ~ '\S\s+\S'
  and p.name is distinct from (trim(left(trim(p.name), length(trim(p.name)) - length(substring(trim(p.name) from '(\S+)$')))) || ' ' || upper(substring(trim(p.name) from '(\S+)$')));

notify pgrst, 'reload schema';
