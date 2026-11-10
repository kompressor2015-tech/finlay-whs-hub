import { useCallback, useEffect, useState } from 'react';

/**
 * Simple screen routing on the address hash:
 *   #/                 home
 *   #/m/incidents      a module's main page
 *   #/incidents/new    report an incident;  #/incidents/<id>  one incident
 *   #/hazards/new      report a hazard;     #/hazards/<id>    one hazard
 */
export type Route =
  | { name: 'home' }
  | { name: 'module'; id: string }
  | { name: 'incident'; id: string }
  | { name: 'hazard'; id: string };

export function parseHash(hash: string): Route {
  const m = /^#\/m\/([a-z-]+)/.exec(hash);
  if (m) return { name: 'module', id: m[1] };
  const r = /^#\/(incidents|hazards)\/([A-Za-z0-9-]+)/.exec(hash);
  if (r) return { name: r[1] === 'incidents' ? 'incident' : 'hazard', id: r[2] };
  return { name: 'home' };
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'module':
      return `#/m/${route.id}`;
    case 'incident':
      return `#/incidents/${route.id}`;
    case 'hazard':
      return `#/hazards/${route.id}`;
  }
}

export function go(route: Route): void {
  window.location.hash = hrefFor(route);
}

/** Which menu item a screen belongs to. */
export function moduleOf(route: Route): string {
  if (route.name === 'module') return route.id;
  if (route.name === 'incident') return 'incidents';
  if (route.name === 'hazard') return 'hazards';
  return 'home';
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

  const navigate = useCallback((next: Route) => go(next), []);

  return { route, go: navigate };
}
