import { useEffect, useState } from 'react';
import { listMachines, listPeople, listSites, type MachineOption, type PersonOption, type SiteOption } from '../services/records.ts';

interface Lookups {
  machines: MachineOption[];
  sites: SiteOption[];
  people: PersonOption[];
}

let cache: Promise<Lookups> | null = null;

/** The fleet's machines, Finlay sites and people, loaded once per visit. */
export function useLookups(): Lookups {
  const [value, setValue] = useState<Lookups>({ machines: [], sites: [], people: [] });
  useEffect(() => {
    if (!cache) {
      cache = Promise.all([listMachines(), listSites(), listPeople()]).then(([machines, sites, people]) => ({ machines, sites, people }));
    }
    let live = true;
    cache.then(v => live && setValue(v));
    return () => {
      live = false;
    };
  }, []);
  return value;
}
