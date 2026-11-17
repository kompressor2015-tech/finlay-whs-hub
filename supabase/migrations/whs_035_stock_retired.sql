-- whs_035_stock_retired.sql
-- "No longer kept here": a storage line can be retired instead of deleted, so its count history stays.
-- The app hides retired lines from site registers and stocktakes and lists them on the product page.
-- Office roles can already change storage lines (existing policy), so no policy change is needed.
-- Safe to run more than once.

alter table public.whs_chem_stock add column if not exists retired_at timestamptz;
create index if not exists whs_chem_stock_active_idx on public.whs_chem_stock (site_id) where retired_at is null;

notify pgrst, 'reload schema';
