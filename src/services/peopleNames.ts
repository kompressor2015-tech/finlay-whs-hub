/** Names of current workers, for suggesting in forms. Falls back to nothing (free typing still works). */

import { supabase } from './supabase.ts';
import type { NameOption } from '../utils/nameSuggest.ts';

export async function listPeopleNames(): Promise<NameOption[]> {
  const { data, error } = await supabase.rpc('whs_people_names');
  if (error || !data) return [];
  return (data as { id: string; name: string; position: string }[]).map(p => ({ id: p.id, name: p.name, position: p.position }));
}
