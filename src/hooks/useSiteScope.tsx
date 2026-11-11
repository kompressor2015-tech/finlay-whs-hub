import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '../services/supabase.ts';
import { rememberSite, rememberedSite } from './useRegister.ts';
import { ALL_SITES, pickSite, type ScopeSite } from '../utils/siteScope.ts';

interface Scope {
  sites: ScopeSite[];
  /** The chosen site, or null for all sites */
  site: ScopeSite | null;
  setSiteId: (id: string) => void;
  /** Reload the sites after one is edited */
  refresh: () => void;
}

const Ctx = createContext<Scope>({ sites: [], site: null, setSiteId: () => {}, refresh: () => {} });

/** The site switcher's state, shared by every screen and remembered between visits. */
export function SiteScopeProvider({ children }: { children: ReactNode }) {
  const [sites, setSites] = useState<ScopeSite[]>([]);
  const [id, setId] = useState<string>(() => rememberedSite() ?? ALL_SITES);

  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let live = true;
    supabase.from('whs_sites').select('id, name, also_known_as, depot_site_id').order('name').then(({ data }) => {
      if (live && data) setSites(data.map(s => ({ id: String(s.id), name: String(s.name), aliases: (s.also_known_as as string[] | null) ?? [], depotSiteId: s.depot_site_id ? String(s.depot_site_id) : null })));
    });
    return () => {
      live = false;
    };
  }, [tick]);

  const setSiteId = useCallback((next: string) => {
    setId(next);
    rememberSite(next);
  }, []);

  const value = useMemo(() => ({ sites, site: pickSite(sites, id), setSiteId, refresh }), [sites, id, setSiteId, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSiteScope(): Scope {
  return useContext(Ctx);
}
