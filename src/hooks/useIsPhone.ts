import { useCallback, useEffect, useState } from 'react';

const QUERY = '(max-width: 767px)';
const KEY = 'whsFullView';

function readFull(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Phone screens get the phone layout. Someone on a phone can choose the full version for the
 * rest of the visit (kept until the tab closes), the same as the fleet app.
 */
export function useIsPhone() {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(QUERY).matches);
  const [full, setFull] = useState(readFull);

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const setUseFull = useCallback((v: boolean) => {
    setFull(v);
    try {
      if (v) sessionStorage.setItem(KEY, '1');
      else sessionStorage.removeItem(KEY);
    } catch {
      // storage unavailable
    }
  }, []);

  return { narrow, showPhone: narrow && !full, setUseFull };
}
