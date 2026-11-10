import { useCallback, useEffect, useState } from 'react';

/**
 * Simple screen routing on the address hash:
 *   #/                 home
 *   #/m/incidents      a module's main page
 *   #/incidents/new    report an incident;  #/incidents/<id>  one incident
 *   #/hazards/new      report a hazard;     #/hazards/<id>    one hazard
 *   #/checks/new-prestart, #/checks/new-take5, #/checks/new-site-<checklist id>, #/checks/<id>
 *   #/checklists/<id>  edit a checklist
 */
export type Route =
  | { name: 'home' }
  | { name: 'module'; id: string }
  | { name: 'incident'; id: string }
  | { name: 'hazard'; id: string }
  | { name: 'check'; id: string }
  | { name: 'checklist'; id: string };

export function parseHash(hash: string): Route {
  const m = /^#\/m\/([a-z-]+)/.exec(hash);
  if (m) return { name: 'module', id: m[1] };
  const r = /^#\/(incidents|hazards|checks|checklists)\/([A-Za-z0-9-]+)/.exec(hash);
  if (r) {
    const names = { incidents: 'incident', hazards: 'hazard', checks: 'check', checklists: 'checklist' } as const;
    return { name: names[r[1] as keyof typeof names], id: r[2] };
  }
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
    case 'check':
      return `#/checks/${route.id}`;
    case 'checklist':
      return `#/checklists/${route.id}`;
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
  if (route.name === 'check' || route.name === 'checklist') return 'inspections';
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
