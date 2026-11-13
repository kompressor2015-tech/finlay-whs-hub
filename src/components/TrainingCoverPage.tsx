import { useEffect, useMemo, useState } from 'react';
import type { WhsUser } from '../services/auth.ts';
import { listPeople } from '../services/incidentFile.ts';
import { listTickets } from '../services/tickets.ts';
import { loadChecks, type CheckSite } from '../services/recurringChecks.ts';
import { useSiteScope } from '../hooks/useSiteScope.tsx';
import { hrefFor } from '../hooks/useRoute.ts';
import { formatDay } from '../utils/dates.ts';
import type { Person } from '../utils/incidentFile.ts';
import { coverFor, WORKERS_PER_FIRST_AIDER, type Holder } from '../utils/siteCover.ts';
import { currentTickets, ticketPill, ticketState, type Ticket } from '../utils/tickets.ts';
import { ErrorNote } from './Form.tsx';
import { Pill } from './Pill.tsx';

const TILE = { red: 'bg-[#FBE3E4] border-[#F1C0C2]', amber: 'bg-[#FFF3D6] border-[#F0DDA6]', green: 'bg-[#E3F3E6] border-[#BFDFC6]', grey: 'bg-white border-line' } as const;
const th = 'px-2 py-3 font-semibold border-b border-[#EEEBE6] text-left';
const td = 'px-2 py-3 border-b border-line-soft align-top';

/** Training & site cover: first aiders and fire wardens for each site, and every ticket that is out or running out. */
export function TrainingCoverPage({ user: _user }: { user: WhsUser }) {
  const { site } = useSiteScope();
  const [sites, setSites] = useState<CheckSite[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void Promise.all([listPeople(), listTickets(), loadChecks()]).then(([p, t, c]) => {
      setError(p.error ?? t.error ?? c.error ?? null);
      setPeople(p.data ?? []);
      setTickets(t.data ?? []);
      setSites(c.data?.sites ?? []);
      setLoaded(true);
    });
  }, []);

  const shown = sites.filter(s => !site || s.id === site.id || s.id === site.depotSiteId);
  const covers = useMemo(() => shown.map(s => ({ s, c: coverFor(s.id, people, tickets) })), [shown, people, tickets]);
  const active = useMemo(() => new Map(people.filter(p => p.active).map(p => [p.id, p])), [people]);
  const inShown = (p: Person) => !p.site_id || shown.some(s => s.id === p.site_id);

  const attention = useMemo(
    () => currentTickets(tickets.filter(t => active.has(t.person_id) && inShown(active.get(t.person_id) as Person))).filter(t => ['expired', 'due_soon'].includes(ticketState(t))),
    [tickets, active, shown],
  );
  const expired = attention.filter(t => ticketState(t) === 'expired').length;
  const soon = attention.length - expired;
  const shortSites = covers.filter(x => x.c.gaps.length).length;
  const noSite = people.filter(p => p.active && !p.site_id).length;

  const stat = (label: string, value: number, sub: string, tone: keyof typeof TILE) => (
    <div className={`border rounded-xl p-4 ${value ? TILE[tone] : TILE.grey}`}>
      <div className="text-[13px] text-muted">{label}</div>
      <div className="text-[28px] font-bold leading-tight">{value}</div>
      <div className="text-xs text-muted">{sub}</div>
    </div>
  );
  const holderRow = (h: Holder, extra?: string) => (
    <li key={h.person.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
      <a href={hrefFor({ name: 'person', id: h.person.id })} className="font-semibold">{h.person.name}</a>
      {extra && <Pill tone="blue">{extra}</Pill>}
      {h.ticket ? <Pill tone={ticketPill(h.ticket).tone}>{ticketPill(h.ticket).label}</Pill> : <Pill tone="red">No ticket recorded</Pill>}
      {h.ticket?.expires_on && <span className="text-xs text-muted">to {formatDay(h.ticket.expires_on)}</span>}
    </li>
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="m-0 text-[26px] font-bold">Training &amp; site cover</h1>
        <p className="mt-1.5 mb-0 text-muted text-[15px]">Whether each site has enough first aiders and fire wardens, and which tickets have run out or are about to. Set a person&apos;s tickets and site roles on their file in People &amp; claims.</p>
      </div>
      <ErrorNote message={error} />
      <section aria-label="Summary" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stat('Sites short of cover', shortSites, 'first aiders or fire wardens', 'red')}
        {stat('Tickets expired', expired, 'renew now', 'red')}
        {stat('Expire within 60 days', soon, 'book the refresher', 'amber')}
        {stat('People with no site', noSite, 'not counted in site cover', 'amber')}
      </section>

      {!loaded && <p className="text-muted">Loading…</p>}
      {loaded && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {covers.map(({ s, c }) => (
            <section key={s.id} aria-label={s.name} className="bg-white border border-line rounded-xl overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-line-soft">
                <h2 className="m-0 text-base font-bold">{s.name}</h2>
                <Pill tone="grey">{s.state}</Pill>
                <Pill tone={c.gaps.length ? 'red' : c.headcount ? 'green' : 'grey'}>{c.headcount === 0 ? 'No people at this site' : c.gaps.length ? 'Short' : 'Covered'}</Pill>
              </div>
              <div className="px-4 py-3 flex flex-col gap-3">
                {c.gaps.length > 0 && <ul className="m-0 pl-5 text-sm text-[#8E0F15]">{c.gaps.map(g => <li key={g}>{g}</li>)}</ul>}
                <div>
                  <h3 className="m-0 text-[13px] font-semibold text-muted">First aiders: {c.validFirstAiders} of {c.required} needed <span className="font-normal">({c.headcount} {c.headcount === 1 ? 'person' : 'people'} at the site)</span></h3>
                  {c.firstAiders.length ? <ul className="m-0 p-0 list-none">{c.firstAiders.map(h => holderRow(h))}</ul> : <p className="m-0 mt-1 text-sm text-muted">None named.</p>}
                </div>
                <div>
                  <h3 className="m-0 text-[13px] font-semibold text-muted">Fire wardens: {c.validWardens}</h3>
                  {c.wardens.length ? <ul className="m-0 p-0 list-none">{c.wardens.map(h => holderRow(h, h.person.warden_role === 'chief' ? 'Chief warden' : undefined))}</ul> : <p className="m-0 mt-1 text-sm text-muted">None named.</p>}
                </div>
              </div>
            </section>
          ))}
        </div>
      )}

      {loaded && (
        <section aria-label="Tickets needing action" className="bg-white border border-line rounded-xl overflow-hidden">
          <h2 className="m-0 px-4 py-3 text-base font-bold border-b border-line-soft">Tickets to renew</h2>
          {attention.length === 0 ? <p className="m-0 px-4 py-4 text-sm text-muted">Nothing expired or expiring in the next 60 days.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead><tr><th className={`${th} pl-4`}>Person</th><th className={th}>Ticket</th><th className={th}>Expires</th><th className={`${th} pr-4`}>Status</th></tr></thead>
                <tbody>
                  {attention.map(t => {
                    const p = active.get(t.person_id) as Person;
                    const pill = ticketPill(t);
                    return (
                      <tr key={t.id}>
                        <td className={`${td} pl-4 font-semibold`}><a href={hrefFor({ name: 'person', id: p.id })}>{p.name}</a><span className="block text-xs text-muted font-normal">{sites.find(x => x.id === p.site_id)?.name ?? 'No site'}</span></td>
                        <td className={td}>{t.name}</td>
                        <td className={td}>{formatDay(t.expires_on)}</td>
                        <td className={`${td} pr-4`}><Pill tone={pill.tone}>{pill.label}</Pill></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <p className="m-0 text-xs text-muted">How cover is worked out: one first aider for every {WORKERS_PER_FIRST_AIDER} workers (Finlay sites are treated as high risk; the state first aid codes give 1 in 50 for low risk and 1 in 10 for remote high risk). Only people at the site whose first aid ticket has not expired count. Headcount is the active people whose site is set to that site. The fire warden refresher interval is still to be confirmed.</p>
    </div>
  );
}
