import { ChevronDown, LogOut, Plus, Search, Smartphone } from 'lucide-react';
import type { WhsUser } from '../services/auth.ts';
import type { HomeData } from '../utils/homeData.ts';
import { summaryValue } from '../utils/homeData.ts';
import { accessLabel, canOpenModule } from '../utils/access.ts';
import { pillFor, sortAttention } from '../utils/attention.ts';
import { formatDate, formatLongDate, formatWhen, greeting } from '../utils/dates.ts';
import { MODULES } from '../utils/modules.ts';
import { hrefFor, moduleOf, type Route } from '../hooks/useRoute.ts';
import { HomeCharts } from './HomeCharts.tsx';
import { Pill } from './Pill.tsx';
import { Screen } from './Screen.tsx';

interface Props {
  user: WhsUser;
  data: HomeData;
  route: Route;
  onSignOut: () => void;
  /** Shown on a phone that chose the full version */
  onPhoneLayout?: () => void;
}

const NEW_MENU = [
  { href: hrefFor({ name: 'incident', id: 'new' }), title: 'Report an incident' },
  { href: hrefFor({ name: 'hazard', id: 'new' }), title: 'Report a hazard' },
  { href: hrefFor({ name: 'check', id: 'new-prestart' }), title: 'Pre-start check' },
  { href: hrefFor({ name: 'check', id: 'new-take5' }), title: 'Take 5' },
  { href: hrefFor({ name: 'module', id: 'inspections' }), title: 'Site inspection' },
];

/** Menu groups, in order; anything not listed falls under More. */
const GROUPS: { label: string; ids: string[] }[] = [
  { label: 'Do', ids: ['incidents', 'hazards', 'actions', 'inspections'] },
  { label: 'Registers', ids: ['chemicals', 'plant', 'documents'] },
];

export function DesktopApp({ user, data, route, onSignOut, onPhoneLayout }: Props) {
  const navItems = MODULES.filter(m => canOpenModule(user.access, m.id));
  const activeId = moduleOf(route);
  const navLink = (active: boolean) =>
    `no-underline flex items-center justify-between px-3 py-2.5 rounded-lg text-sm ${
      active ? 'bg-finlay-soft text-finlay-dark font-semibold' : 'text-ink hover:bg-white'
    }`;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-white border-b border-line px-6 py-3.5 flex flex-wrap items-center gap-4 print:hidden">
        <a href={hrefFor({ name: 'home' })} className="flex items-center gap-3 no-underline text-ink" aria-label="Finlay WHS home">
          <img src="/finlay-logo.jpg" alt="Finlay" className="h-7 w-auto block" />
          <span className="border-l border-line pl-3 font-bold text-[17px] text-finlay tracking-wide">WHS</span>
        </a>
        <div className="relative flex-[1_1_280px] max-w-[520px]">
          <label htmlFor="search" className="sr-only">Search</label>
          <Search className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            id="search"
            type="search"
            disabled
            placeholder="Search incidents, units, people, documents (coming soon)"
            className="w-full h-10 rounded-lg border border-[#D6D2CC] bg-[#FAFAF9] pl-10 pr-3.5 text-sm disabled:cursor-not-allowed"
          />
        </div>
        <div className="ml-auto flex items-center gap-3">
          <details className="relative">
            <summary className="list-none h-10 px-4 rounded-lg bg-finlay hover:bg-finlay-dark text-white font-semibold text-sm flex items-center gap-1.5 cursor-pointer select-none [&::-webkit-details-marker]:hidden">
              <Plus className="w-4 h-4" aria-hidden="true" /> New <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            </summary>
            <div className="absolute right-0 mt-1.5 w-56 bg-white border border-line rounded-xl shadow-lg py-1.5 z-20">
              {NEW_MENU.map(n => (
                <a key={n.title} href={n.href} onClick={e => e.currentTarget.closest('details')?.removeAttribute('open')} className="block no-underline text-ink text-sm px-4 py-2.5 hover:bg-[#FAF8F6]">{n.title}</a>
              ))}
            </div>
          </details>
          {onPhoneLayout && (
            <button type="button" onClick={onPhoneLayout} className="h-10 px-3 rounded-lg border border-line bg-white text-sm flex items-center gap-1.5 cursor-pointer">
              <Smartphone className="w-4 h-4" aria-hidden="true" /> Phone layout
            </button>
          )}
          <div className="text-right text-[13px] leading-tight">
            <div className="font-semibold">{user.name}</div>
            <div className="text-muted">{accessLabel(user.access)}</div>
          </div>
          <button type="button" onClick={onSignOut} aria-label="Sign out" title="Sign out" className="w-10 h-10 rounded-lg border border-line bg-white flex items-center justify-center cursor-pointer hover:text-finlay">
            <LogOut className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="flex items-start">
        <nav aria-label="Modules" className="w-[236px] flex-none sticky top-0 px-3 py-5 flex flex-col gap-0.5 print:hidden">
          <a href={hrefFor({ name: 'home' })} className={navLink(activeId === 'home')} aria-current={activeId === 'home' ? 'page' : undefined}>Home</a>
          {[...GROUPS, { label: 'More', ids: navItems.map(m => m.id).filter(id => !GROUPS.some(g => g.ids.includes(id))) }].map(g => {
            const items = g.ids.map(id => navItems.find(m => m.id === id)).filter((m): m is (typeof navItems)[number] => !!m);
            if (!items.length) return null;
            return (
              <div key={g.label} className="flex flex-col gap-0.5">
                <div className="text-[11px] font-semibold tracking-wider uppercase text-muted px-3 pt-4 pb-1">{g.label}</div>
                {items.map(m => (
                  <a key={m.id} href={hrefFor({ name: 'module', id: m.id })} className={navLink(activeId === m.id)} aria-current={activeId === m.id ? 'page' : undefined}>
                    {m.label}
                    {data.navCounts[m.id] ? <span className={`text-xs ${m.id === 'actions' || m.id === 'chemicals' ? 'bg-finlay text-white rounded-full px-2 py-0.5 font-semibold' : 'text-muted'}`}>{data.navCounts[m.id]}</span> : null}
                  </a>
                ))}
              </div>
            );
          })}
        </nav>

        <main className="flex-1 min-w-0 px-7 pt-7 pb-12">
          <Screen route={route} user={user} home={() => <DesktopHome data={data} />} />
        </main>
      </div>
    </div>
  );
}

function DesktopHome({ data }: { data: HomeData }) {
  const now = new Date();
  const attention = sortAttention(data.attention);
  const summary = (id: string) => data.summary.find(s => s.id === id);
  const board = data.board;
  const tiles: { label: string; value: string; note: string; bad: boolean; href: string }[] = [
    { label: 'Open incidents', value: summaryValue(summary('incidents') ?? { id: '', label: '', value: null, sub: '' }), note: summary('incidents')?.sub ?? '', bad: (summary('incidents')?.value ?? 0) > 0, href: hrefFor({ name: 'module', id: 'incidents' }) },
    { label: 'Open hazards', value: String(data.navCounts.hazards ?? 0), note: `${summary('hazards')?.value ?? 0} to review`, bad: (summary('hazards')?.value ?? 0) > 0, href: hrefFor({ name: 'module', id: 'hazards' }) },
    { label: 'Overdue actions', value: summaryValue(summary('actions') ?? { id: '', label: '', value: null, sub: '' }), note: summary('actions')?.sub ?? '', bad: (summary('actions')?.value ?? 0) > 0, href: hrefFor({ name: 'module', id: 'actions' }) },
  ];
  if (board) {
    tiles.push(
      { label: 'Inspections due', value: String(board.inspectionsDue), note: board.inspectionsDue ? 'overdue or due this week' : 'all up to date', bad: board.inspectionsDue > 0, href: hrefFor({ name: 'module', id: 'inspections' }) },
      { label: 'SDS to review', value: String(board.sdsToReview), note: 'missing, over 5 years, or due', bad: board.sdsToReview > 0, href: hrefFor({ name: 'module', id: 'chemicals' }) },
      { label: 'Stocktakes due', value: String(board.stocktakesDue), note: board.stocktakeSites.join(', ') || 'all up to date', bad: board.stocktakesDue > 0, href: hrefFor({ name: 'chem', id: 'stocktake' }) },
    );
  }
  const card = 'bg-white border border-line rounded-xl overflow-hidden';
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="m-0 text-[26px] font-bold">{greeting(now)}</h1>
        <p className="mt-1.5 mb-0 text-muted text-[15px]">{formatLongDate(now)} · All Finlay sites</p>
      </div>

      <section aria-label="Summary" className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-3">
        {tiles.map(s => (
          <a key={s.label} href={s.href} className="no-underline text-ink bg-white border border-line hover:border-[#CFCAC2] rounded-xl p-4">
            <div className="text-muted text-[13px]">{s.label}</div>
            <div className={`text-[28px] font-bold mt-1 ${s.bad ? 'text-finlay' : 'text-ink'}`}>{s.value}</div>
            <div className={`text-xs mt-0.5 ${s.bad ? 'text-finlay-dark' : 'text-muted'}`}>{s.note}</div>
          </a>
        ))}
      </section>

      {data.charts && <HomeCharts charts={data.charts} inspections={board?.inspections} />}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-5 items-start">
        <section className={card}>
          <div className="px-4.5 py-4 border-b border-[#EEEBE6] flex justify-between items-center">
            <h2 className="m-0 text-[17px] font-semibold flex items-center gap-2">Needs attention {attention.length > 0 && <span className="text-xs font-semibold bg-finlay-soft text-finlay-dark rounded-full px-2 py-0.5">{attention.length}</span>}</h2>
            {attention.length > 0 && <a href={hrefFor({ name: 'module', id: 'actions' })} className="text-[13px] text-ink">See all</a>}
          </div>
          {attention.length === 0 ? (
            <p className="m-0 px-4.5 py-8 text-sm text-muted text-center">Nothing needs attention right now.</p>
          ) : (
            attention.map(a => {
              const pill = pillFor(a.urgency);
              return (
                <a key={a.id} href={a.href ?? hrefFor({ name: 'module', id: a.moduleId })} className="no-underline text-ink flex items-center gap-3.5 px-4.5 py-3.5 border-b border-line-soft last:border-b-0 hover:bg-[#FAFAF9]">
                  <Pill tone={pill.tone} className="min-w-[100px]">{pill.label}</Pill>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium">
                      {a.title} {a.unit && <span className="text-finlay font-bold">{a.unit}</span>}
                    </span>
                    <span className="block text-[13px] text-muted mt-0.5">{a.detail}</span>
                  </span>
                  <span className="text-[13px] text-muted whitespace-nowrap">{a.due ? formatDate(`${a.due}T02:00:00Z`) : '—'}</span>
                </a>
              );
            })
          )}
        </section>

        <div className="flex flex-col gap-5 min-w-0">
          {board && board.sites.length > 0 && (
            <section className={card} aria-label="By site">
              <div className="px-4.5 py-4 border-b border-[#EEEBE6]"><h2 className="m-0 text-[15px] font-semibold">By site</h2></div>
              {board.sites.map(s => (
                <a key={s.id} href={s.href} className="no-underline text-ink flex items-center gap-3 px-4.5 py-3 border-b border-line-soft last:border-b-0 hover:bg-[#FAFAF9]">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold">{s.name}</span>
                    <span className="block text-[13px] text-muted">{s.sub}</span>
                  </span>
                  <Pill tone={s.tone}>{s.pill}</Pill>
                </a>
              ))}
            </section>
          )}

          {board && (
            <section className={card} aria-label="Coming up">
              <div className="px-4.5 py-4 border-b border-[#EEEBE6]"><h2 className="m-0 text-[15px] font-semibold">Coming up, next 30 days</h2></div>
              {board.coming.length === 0 ? (
                <p className="m-0 px-4.5 py-5 text-sm text-muted">Nothing due in the next 30 days.</p>
              ) : (
                board.coming.map(c => (
                  <a key={`${c.day}-${c.what}-${c.site}`} href={c.href} className="no-underline text-ink flex items-center gap-3 px-4.5 py-2.5 border-b border-line-soft last:border-b-0 text-sm hover:bg-[#FAFAF9]">
                    <span className="w-14 font-semibold text-[13px]">{c.day.slice(8, 10)}/{c.day.slice(5, 7)}</span>
                    <span className="flex-1">{c.what}</span>
                    <span className="text-[13px] text-muted">{c.site}</span>
                  </a>
                ))
              )}
            </section>
          )}

          <section className={card} aria-label="Latest reports">
            <div className="px-4.5 py-4 border-b border-[#EEEBE6]"><h2 className="m-0 text-[15px] font-semibold">Latest reports</h2></div>
            {data.latest.length === 0 ? (
              <p className="m-0 px-4.5 py-5 text-sm text-muted">No reports yet.</p>
            ) : (
              data.latest.map(l => (
                <div key={l.id} className="px-4.5 py-3 border-b border-line-soft last:border-b-0">
                  <div className="flex justify-between gap-2 text-xs text-muted"><span>{l.type}</span><span>{formatWhen(l.at, now)}</span></div>
                  <div className="text-sm font-medium mt-0.5">{l.title}</div>
                  <div className="text-[13px] text-muted mt-0.5">{l.by}</div>
                </div>
              ))
            )}
          </section>

          <section className="bg-white border border-line rounded-xl px-4.5 py-4">
            <h2 className="m-0 mb-1.5 text-[15px] font-semibold">Notifiable incident?</h2>
            <p className="m-0 text-[13px] leading-relaxed text-muted">
              Deaths, serious injuries or illnesses and dangerous incidents must be reported to WHSQ straight away, and the site left undisturbed. The incident form will prompt you.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
