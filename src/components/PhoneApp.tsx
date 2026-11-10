import { useState } from 'react';
import { AlertTriangle, ChevronLeft, Search } from 'lucide-react';
import type { WhsUser } from '../services/auth.ts';
import type { HomeData, PhoneTask } from '../utils/homeData.ts';
import { accessLabel } from '../utils/access.ts';
import { formatDate } from '../utils/dates.ts';
import { hrefFor, type Route } from '../hooks/useRoute.ts';
import { Pill } from './Pill.tsx';
import { ModulePage } from './ModulePage.tsx';
import { SampleToggle } from './SampleToggle.tsx';

interface Props {
  user: WhsUser;
  data: HomeData;
  route: Route;
  sample: boolean;
  onSampleChange: (on: boolean) => void;
  onSignOut: () => void;
  onFullVersion: () => void;
}

const QUICK = [
  { id: 'inspections', title: 'Pre-start', sub: 'Plant check' },
  { id: 'inspections', title: 'Take 5', sub: 'Before a task' },
  { id: 'hazards', title: 'Hazard', sub: 'Report it' },
];

export function PhoneApp({ user, data, route, sample, onSampleChange, onSignOut, onFullVersion }: Props) {
  const [tab, setTab] = useState<'home' | 'me'>('home');
  const onModule = route.name === 'module';
  const activeTab = onModule ? (route.id === 'incidents' ? 'report' : route.id === 'inspections' ? 'checks' : '') : tab;

  const tabs = [
    { key: 'home', label: 'Home', href: hrefFor({ name: 'home' }), onClick: () => setTab('home') },
    { key: 'report', label: 'Report', href: hrefFor({ name: 'module', id: 'incidents' }) },
    { key: 'checks', label: 'Checks', href: hrefFor({ name: 'module', id: 'inspections' }) },
    { key: 'me', label: 'Me', href: hrefFor({ name: 'home' }), onClick: () => setTab('me') },
  ];

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <header className="bg-white border-b border-line px-5 pt-4.5 pb-3.5 flex items-center justify-between sticky top-0 z-10">
        {onModule ? (
          <a href={hrefFor({ name: 'home' })} className="no-underline text-ink flex items-center gap-1 text-[15px] font-semibold min-h-11">
            <ChevronLeft className="w-5 h-5" aria-hidden="true" /> Home
          </a>
        ) : (
          <div>
            <div className="font-bold text-[17px]">Finlay <span className="text-finlay">WHS</span></div>
            <div className="text-[13px] text-muted mt-0.5">
              {formatDate(new Date())}{user.location ? ` · ${user.location}` : ''}
            </div>
          </div>
        )}
        <div className="w-10 h-10 rounded-full bg-[#EEEBE6] flex items-center justify-center text-sm font-semibold" aria-label={user.name}>
          {user.initials}
        </div>
      </header>

      <main className="flex-1 px-4 py-4.5 pb-28 flex flex-col gap-4.5">
        {onModule ? (
          <ModulePage id={route.id} access={user.access} />
        ) : tab === 'me' ? (
          <MePanel user={user} sample={sample} onSampleChange={onSampleChange} onSignOut={onSignOut} onFullVersion={onFullVersion} />
        ) : (
          <PhoneHome data={data} />
        )}
      </main>

      <nav aria-label="Main" className="fixed bottom-0 inset-x-0 bg-white border-t border-line grid grid-cols-4 px-1 pt-1.5 pb-[max(18px,env(safe-area-inset-bottom))]">
        {tabs.map(t => (
          <a
            key={t.key}
            href={t.href}
            onClick={t.onClick}
            aria-current={activeTab === t.key ? 'page' : undefined}
            className={`no-underline min-h-12 flex items-center justify-center text-[13px] ${
              activeTab === t.key ? 'text-finlay font-bold' : 'text-ink font-medium'
            }`}
          >
            {t.label}
          </a>
        ))}
      </nav>
    </div>
  );
}

function PhoneHome({ data }: { data: HomeData }) {
  return (
    <>
      <a href={hrefFor({ name: 'module', id: 'incidents' })} className="no-underline bg-finlay text-white rounded-[14px] p-4.5 flex items-center gap-3.5">
        <AlertTriangle className="w-7 h-7 shrink-0" aria-hidden="true" />
        <span>
          <span className="block font-bold text-lg">Report an incident</span>
          <span className="block text-[13px] opacity-90 mt-0.5">Injury, damage or near miss</span>
        </span>
      </a>

      <div className="grid grid-cols-3 gap-2.5">
        {QUICK.map(q => (
          <a key={q.title} href={hrefFor({ name: 'module', id: q.id })} className="no-underline text-ink bg-white border border-line rounded-xl min-h-[84px] p-2.5 flex flex-col justify-center items-center text-center gap-1">
            <span className="font-semibold text-sm">{q.title}</span>
            <span className="text-xs text-muted">{q.sub}</span>
          </a>
        ))}
      </div>

      <a href={hrefFor({ name: 'module', id: 'chemicals' })} className="no-underline text-ink bg-white border border-line rounded-xl p-3.5 min-h-14 flex items-center gap-3">
        <Search className="w-5.5 h-5.5" aria-hidden="true" />
        <span className="flex-1">
          <span className="block text-[15px] font-semibold">Find a safety data sheet</span>
          <span className="block text-[13px] text-muted mt-0.5">Search chemicals at this site</span>
        </span>
      </a>

      <TaskList title="Today" items={data.phoneToday} empty="Nothing to do yet. Pre-starts arrive in step 3." />
      <TaskList title="To read and sign" items={data.phoneToSign} empty="Nothing to sign. Documents arrive in step 5." />
    </>
  );
}

function TaskList({ title, items, empty }: { title: string; items: PhoneTask[]; empty: string }) {
  return (
    <section>
      <h2 className="m-0 mb-2 text-[15px] font-semibold">{title}</h2>
      <div className="bg-white border border-line rounded-xl overflow-hidden">
        {items.length === 0 ? (
          <p className="m-0 p-3.5 text-sm text-muted">{empty}</p>
        ) : (
          items.map(t => (
            <div key={t.id} className="flex items-center gap-3 p-3.5 min-h-14 border-b border-line-soft last:border-b-0">
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-medium">
                  {t.title} {t.unit && <span className="text-finlay font-bold">{t.unit}</span>}
                </span>
                <span className="block text-[13px] text-muted mt-0.5">{t.detail}</span>
              </span>
              <Pill tone={t.tone}>{t.pill}</Pill>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function MePanel({ user, sample, onSampleChange, onSignOut, onFullVersion }: {
  user: WhsUser;
  sample: boolean;
  onSampleChange: (on: boolean) => void;
  onSignOut: () => void;
  onFullVersion: () => void;
}) {
  const row = 'w-full min-h-12 px-4 flex items-center bg-white border-0 border-b border-line-soft last:border-b-0 text-[15px] text-left cursor-pointer';
  return (
    <>
      <div className="bg-white border border-line rounded-xl p-4">
        <div className="font-semibold text-[17px]">{user.name}</div>
        <div className="text-sm text-muted mt-0.5">{accessLabel(user.access)} · {user.email}</div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">Preview the layout</span>
        <SampleToggle on={sample} onChange={onSampleChange} />
      </div>
      <div className="bg-white border border-line rounded-xl overflow-hidden">
        <button type="button" onClick={onFullVersion} className={row}>Use the full version</button>
        <button type="button" onClick={onSignOut} className={`${row} text-finlay font-semibold`}>Sign out</button>
      </div>
    </>
  );
}
