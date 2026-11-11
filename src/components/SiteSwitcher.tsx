import { MapPin } from 'lucide-react';
import { useSiteScope } from '../hooks/useSiteScope.tsx';
import { ALL_SITES } from '../utils/siteScope.ts';

/** Choose one site and every number and list follows it, or look at all sites together. */
export function SiteSwitcher({ className = '' }: { className?: string }) {
  const { sites, site, setSiteId } = useSiteScope();
  if (!sites.length) return null;
  return (
    <label className={`relative flex items-center ${className}`}>
      <span className="sr-only">Site</span>
      <MapPin className={`w-4 h-4 absolute left-3 pointer-events-none ${site ? 'text-finlay' : 'text-muted'}`} aria-hidden="true" />
      <select
        value={site?.id ?? ALL_SITES}
        onChange={e => setSiteId(e.target.value)}
        className={`h-10 rounded-lg border bg-white pl-9 pr-8 text-sm font-semibold cursor-pointer ${site ? 'border-finlay text-finlay-dark' : 'border-line text-ink'}`}
      >
        <option value={ALL_SITES}>All sites</option>
        {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </label>
  );
}
