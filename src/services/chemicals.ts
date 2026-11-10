/** The chemical register: sites, chemicals, where they're kept, counts and SDS files. */

import { supabase } from './supabase.ts';
import type { Chemical, Sds, Site, Stock } from '../utils/chemicals.ts';
import type { Stocktake, StocktakeLine } from '../utils/stocktakes.ts';

type Result<T> = { data?: T; error?: string };

function friendly(message: string | undefined): string {
  if (!message) return 'Something went wrong. Please try again.';
  if (/^(A count|That storage|You do not|Authorising a stocktake|This stocktake)/.test(message)) return message;
  if (/duplicate key.*whs_chemicals_name/i.test(message)) return 'There is already a chemical with that name.';
  if (/row-level security|permission denied/i.test(message)) return 'You do not have permission to do that.';
  if (/does not exist|class_confirmed|whs_stocktakes/i.test(message)) return 'The chemical tables are not up to date. Run the latest step 4 SQL in Supabase.';
  return message;
}

export interface Register {
  sites: Site[];
  chemicals: Chemical[];
  stock: Stock[];
  sds: Sds[];
}

/** Everything for the register in one go (a few hundred rows at most). */
export async function loadRegister(): Promise<Result<Register>> {
  const [sites, chemicals, stock, sds] = await Promise.all([
    supabase.from('whs_sites').select('*').order('name'),
    supabase.from('whs_chemicals').select('*').order('name'),
    supabase.from('whs_chem_stock').select('*').order('location'),
    supabase.from('whs_sds').select('*').order('issue_date', { ascending: false }),
  ]);
  const err = sites.error ?? chemicals.error ?? stock.error ?? sds.error;
  if (err) return { error: friendly(err.message) };
  return {
    data: {
      sites: (sites.data ?? []) as Site[],
      chemicals: (chemicals.data ?? []) as Chemical[],
      stock: ((stock.data ?? []) as Stock[]).map(s => ({ ...s, container_size: s.container_size === null ? null : Number(s.container_size), count: s.count === null ? null : Number(s.count), max_count: s.max_count === null ? null : Number(s.max_count) })),
      sds: (sds.data ?? []) as Sds[],
    },
  };
}

export type ChemicalInput = Omit<Chemical, 'id'>;

export async function createChemical(input: ChemicalInput): Promise<Result<Chemical>> {
  const { data, error } = await supabase.from('whs_chemicals').insert(input).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as Chemical };
}

export async function updateChemical(id: string, patch: Partial<ChemicalInput>): Promise<Result<Chemical>> {
  const { data, error } = await supabase.from('whs_chemicals').update(patch).eq('id', id).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as Chemical };
}

export type StockInput = Pick<Stock, 'chemical_id' | 'site_id' | 'location' | 'container' | 'container_size' | 'unit' | 'max_count'>;

export async function addStock(input: StockInput): Promise<Result<Stock>> {
  const { data, error } = await supabase.from('whs_chem_stock').insert(input).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as Stock };
}

export async function updateStock(id: string, patch: Partial<StockInput>): Promise<Result<Stock>> {
  const { data, error } = await supabase.from('whs_chem_stock').update(patch).eq('id', id).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as Stock };
}

export async function deleteStock(id: string): Promise<Result<true>> {
  const { error } = await supabase.from('whs_chem_stock').delete().eq('id', id);
  return error ? { error: friendly(error.message) } : { data: true };
}

/** Record a stocktake count (anyone with WHS access). */
export async function recordCount(stockId: string, count: number): Promise<Result<true>> {
  const { error } = await supabase.rpc('whs_record_count', { p_stock_id: stockId, p_count: count });
  return error ? { error: friendly(error.message) } : { data: true };
}

/** Upload an SDS PDF for a chemical. Older versions are kept. */
export async function uploadSds(chemicalId: string, file: File, issueDate: string): Promise<Result<Sds>> {
  const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
  const path = `${chemicalId}/${issueDate}_${crypto.randomUUID().slice(0, 8)}_${safe}`;
  const up = await supabase.storage.from('whs-sds').upload(path, file, { contentType: file.type || 'application/pdf' });
  if (up.error) return { error: `Could not upload ${file.name}: ${friendly(up.error.message)}` };
  const { data, error } = await supabase.from('whs_sds').insert({ chemical_id: chemicalId, file_path: path, file_name: file.name, issue_date: issueDate }).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as Sds };
}

/** A short-lived link to open an SDS. */
export async function sdsLink(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('whs-sds').createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function openSds(path: string): Promise<void> {
  // Open the tab straight away (phones block pop-ups opened after a wait), then point it at the file.
  const tab = window.open('', '_blank');
  const url = await sdsLink(path);
  if (url && tab) tab.location.href = url;
  else if (url) window.location.href = url;
  else tab?.close();
}

/** How often a site's stocktake is due (WHS officer). */
export async function updateSite(id: string, patch: Pick<Site, 'stocktake_days'>): Promise<Result<Site>> {
  const { data, error } = await supabase.from('whs_sites').update(patch).eq('id', id).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as Site };
}

// ---------------------------------------------------------------------------------
// Finished stocktakes (the record of each count, authorised with a signature)
// ---------------------------------------------------------------------------------

function toStocktake(row: Record<string, unknown>): Stocktake {
  return { ...(row as unknown as Stocktake), lines: Array.isArray(row.lines) ? (row.lines as StocktakeLine[]) : [] };
}

export async function listStocktakes(siteId?: string): Promise<Result<Stocktake[]>> {
  let q = supabase.from('whs_stocktakes').select('*').order('done_at', { ascending: false }).limit(60);
  if (siteId) q = q.eq('site_id', siteId);
  const { data, error } = await q;
  return error ? { error: friendly(error.message) } : { data: (data ?? []).map(toStocktake) };
}

export async function getStocktake(id: string): Promise<Result<Stocktake>> {
  const { data, error } = await supabase.from('whs_stocktakes').select('*').eq('id', id).maybeSingle();
  if (error) return { error: friendly(error.message) };
  return data ? { data: toStocktake(data) } : { error: 'Stocktake not found.' };
}

export async function finishStocktake(siteId: string, lines: StocktakeLine[], notes: string): Promise<Result<Stocktake>> {
  const { data, error } = await supabase.from('whs_stocktakes').insert({ site_id: siteId, lines, notes }).select('*').single();
  return error ? { error: friendly(error.message) } : { data: toStocktake(data) };
}

/** Office roles: authorise with a drawn signature (already uploaded to the photo store). */
export async function authoriseStocktake(id: string, signaturePath: string): Promise<Result<Stocktake>> {
  const { data, error } = await supabase.from('whs_stocktakes').update({ authorised_signature: signaturePath }).eq('id', id).select('*').single();
  return error ? { error: friendly(error.message) } : { data: toStocktake(data) };
}
