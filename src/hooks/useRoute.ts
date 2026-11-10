import { useCallback, useEffect, useState } from 'react';

/** Simple screen routing on the address hash: #/ is home, #/m/incidents is a module. */
export type Route = { name: 'home' } | { name: 'module'; id: string };

export function parseHash(hash: string): Route {
  const m = /^#\/m\/([a-z-]+)/.exec(hash);
  return m ? { name: 'module', id: m[1] } : { name: 'home' };
}

export function hrefFor(route: Route): string {
  return route.name === 'home' ? '#/' : `#/m/${route.id}`;
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const on = () => {
      setRoute(parseHash(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const go = useCallback((next: Route) => {
    window.location.hash = hrefFor(next);
  }, []);

  return { route, go };
}
