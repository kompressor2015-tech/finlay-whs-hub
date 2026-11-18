import { useEffect, useState } from 'react';
import { listPeopleNames } from '../services/peopleNames.ts';
import type { NameOption } from '../utils/nameSuggest.ts';

let cache: Promise<NameOption[]> | null = null;

/** Current workers' names, loaded once per visit. Empty until loaded, or if the list is not available. */
export function usePeopleNames(): NameOption[] {
  const [names, setNames] = useState<NameOption[]>([]);
  useEffect(() => {
    if (!cache) cache = listPeopleNames().then(v => { if (v.length === 0) cache = null; return v; });
    let live = true;
    void cache.then(v => { if (live) setNames(v); });
    return () => { live = false; };
  }, []);
  return names;
}
