import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadRegister, type Register } from '../services/chemicals.ts';
import { currentSds, type Chemical, type Sds } from '../utils/chemicals.ts';

const EMPTY: Register = { sites: [], chemicals: [], stock: [], sds: [] };

/** The whole chemical register, with handy lookups. */
export function useRegister() {
  const [data, setData] = useState<Register>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const res = await loadRegister();
    setError(res.error ?? null);
    if (res.data) setData(res.data);
    setLoaded(true);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const chemById = useMemo(() => new Map<string, Chemical>(data.chemicals.map(c => [c.id, c])), [data.chemicals]);
  const sdsByChem = useMemo(() => {
    const m = new Map<string, Sds[]>();
    for (const s of data.sds) m.set(s.chemical_id, [...(m.get(s.chemical_id) ?? []), s]);
    return m;
  }, [data.sds]);
  const currentSdsOf = useCallback((id: string) => currentSds(sdsByChem.get(id) ?? []), [sdsByChem]);

  return { ...data, error, loaded, reload, chemById, sdsByChem, currentSdsOf };
}

const SITE_KEY = 'whsChemSite';

export function rememberedSite(): string | null {
  try {
    return localStorage.getItem(SITE_KEY);
  } catch {
    return null;
  }
}

export function rememberSite(id: string): void {
  try {
    localStorage.setItem(SITE_KEY, id);
  } catch {
    // storage unavailable
  }
}
