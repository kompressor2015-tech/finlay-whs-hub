import { LogOut, Search, Smartphone } from 'lucide-react';
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
import { SampleToggle } from './SampleToggle.tsx';

interface Props {
  user: WhsUser;
  data: HomeData;
  route: Route;
  sample: boolean;
  onSampleChange: (on: boolean) => void;
  onSignOut: () => void;
  /** Shown on a phone that chose the full version */
  onPhoneLayout?: () => void;
}

const QUICK = [
  { href: hrefFor({ name: 'hazard', id: 'new' }), title: 'Report a hazard', sub: 'Something unsafe you have seen' },
  { href: hrefFor({ name: 'check', id: 'new-prestart' }), title: 'Pre-start check', sub: 'Daily plant check by unit number' },
  { href: hrefFor({ name: 'check', id: 'new-take5' }), title: 'Take 5', sub: 'Quick check before a task' },
  { href: hrefFor({ name: 'module', id: 'inspections' }), title: 'Site inspection', sub: 'Yard or workshop checklist' },
];

export function DesktopApp({ user, data, route, sample, onSampleChange, onSignOut, onPhoneLayout }: Props) {
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
          <SampleToggle on={sample} onChange={onSampleChange} />
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
          {navItems.map(m => (
            <a key={m.id} href={hrefFor({ name: 'module', id: m.id })} className={navLink(activeId === m.id)} aria-current={activeId === m.id ? 'page' : undefined}>
              {m.label}
              {data.navCounts[m.id] ? <span className="text-xs text-muted">{data.navCounts[m.id]}</span> : null}
            </a>
          ))}
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
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-[26px] font-bold">{greeting(now)}</h1>
          <p className="mt-1.5 mb-0 text-muted text-[15px]">{formatLongDate(now)} · All Finlay sites</p>
        </div>
        <a href={hrefFor({ name: 'incident', id: 'new' })} className="no-underline bg-finlay hover:bg-finlay-dark text-white font-semibold text-[15px] px-4.5 py-3 rounded-lg">
          Report an incident
        </a>
      </div>

      <section aria-label="Quick actions" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {QUICK.map(q => (
          <a key={q.title} href={q.href} className="no-underline text-ink bg-white border border-line hover:border-[#CFCAC2] rounded-xl p-4 flex flex-col gap-1.5 min-h-[92px]">
            <span className="font-semibold text-[15px]">{q.title}</span>
            <span className="text-muted text-[13px] leading-snug">{q.sub}</span>
          </a>
        ))}
      </section>

      <section aria-label="Summary" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {data.summary.map(s => (
          <div key={s.id} className="bg-white border border-line rounded-xl p-4">
            <div className="text-muted text-[13px]">{s.label}</div>
            <div className={`text-[28px] font-bold mt-1 ${s.alert && (s.value ?? 0) > 0 ? 'text-finlay' : 'text-ink'}`}>{summaryValue(s)}</div>
            <div className="text-muted text-xs mt-0.5">{s.sub}</div>
          </div>
        ))}
      </section>

      {data.charts && <HomeCharts charts={data.charts} />}

      <div className="flex flex-wrap gap-5 items-start">
        <section className="flex-[2_1_480px] min-w-0 bg-white border border-line rounded-xl overflow-hidden">
          <div className="px-4.5 py-4 border-b border-[#EEEBE6] flex justify-between items-center">
            <h2 className="m-0 text-[17px] font-semibold">Needs attention</h2>
            {attention.length > 0 && <a href={hrefFor({ name: 'module', id: 'actions' })} className="text-[13px] text-ink">See all</a>}
          </div>
          {attention.length === 0 ? (
            <p className="m-0 px-4.5 py-8 text-sm text-muted text-center">
              Nothing needs attention. Overdue actions, failed checks and documents to sign will show here once those modules are built.
            </p>
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

        <div className="flex-[1_1_300px] min-w-0 flex flex-col gap-5">
          <section className="bg-white border border-line rounded-xl overflow-hidden">
            <div className="px-4.5 py-4 border-b border-[#EEEBE6]">
              <h2 className="m-0 text-[17px] font-semibold">Latest reports</h2>
            </div>
            {data.latest.length === 0 ? (
              <p className="m-0 px-4.5 py-6 text-sm text-muted">No reports yet.</p>
            ) : (
              data.latest.map(l => (
                <div key={l.id} className="px-4.5 py-3 border-b border-line-soft last:border-b-0">
                  <div className="flex justify-between gap-2 text-xs text-muted">
                    <span>{l.type}</span>
                    <span>{formatWhen(l.at, now)}</span>
                  </div>
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
