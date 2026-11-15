import { useEffect, useMemo, useState } from 'react';
import type { WhsUser } from '../services/auth.ts';
import { loadSwms } from '../services/swms.ts';
import { loadJobs, loadSignOns, myPersonId } from '../services/signon.ts';
import { useSiteScope } from '../hooks/useSiteScope.tsx';
import { formatDay } from '../utils/dates.ts';
import { inScope } from '../utils/siteScope.ts';
import { cellFor, outstandingFor, type Job, type JobPerson, type JobSwms, type SignOn } from '../utils/signon.ts';
import { currentApproved, type Swms, type SwmsVersion } from '../utils/swms.ts';
import { ErrorNote } from './Form.tsx';
import { Pill } from './Pill.tsx';

/** The phone view: SWMS to sign on to, and every approved SWMS to read. */
export function SwmsFieldPage({ user }: { user: WhsUser }) {
  const { site } = useSiteScope();
  const [swms, setSwms] = useState<Swms[]>([]);
  const [versions, setVersions] = useState<SwmsVersion[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobSwms, setJobSwms] = useState<JobSwms[]>([]);
  const [jobPeople, setJobPeople] = useState<JobPerson[]>([]);
  const [signons, setSignons] = useState<SignOn[]>([]);
  const [mine, setMine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    void Promise.all([loadSwms(), loadJobs(), loadSignOns(), myPersonId()]).then(([s, j, so, m]) => {
      const err = s.error ?? j.error ?? so.error;
      if (err) setError(err);
      setSwms(s.data?.swms ?? []); setVersions(s.data?.versions ?? []);
      setJobs(j.data?.jobs ?? []); setJobSwms(j.data?.jobSwms ?? []); setJobPeople(j.data?.jobPeople ?? []);
      setSignons(so.data ?? []); setMine(m); setLoaded(true);
    });
  }, []);

  const todo = useMemo(() => (mine ? outstandingFor(mine, jobs, jobSwms, jobPeople, swms, versions, signons) : []), [mine, jobs, jobSwms, jobPeople, swms, versions, signons]);
  const list = swms
    .filter(s => s.status === 'active' && currentApproved(versions.filter(v => v.swms_id === s.id)))
    .filter(s => !s.site_id || inScope(site, { site_id: s.site_id }))
    .filter(s => !q.trim() || `${s.ref} ${s.swms_number} ${s.title}`.toLowerCase().includes(q.trim().toLowerCase()));

  const row = 'no-underline text-ink flex items-center gap-3 p-3.5 min-h-14 border-b border-line-soft last:border-b-0';
  return (
    <div className="flex flex-col gap-4.5">
      <div>
        <h1 className="m-0 text-xl font-bold">SWMS and sign-on</h1>
        <p className="m-0 mt-1 text-sm text-muted">Read the SWMS for your job, then sign on with your finger.</p>
      </div>
      <ErrorNote message={error} />
      {!loaded ? <p className="text-muted">Loading…</p> : (
        <>
          {!mine && <div className="rounded-xl border border-[#F0DDA6] bg-[#FFF3D6] p-3.5 text-sm">Your login is not linked to a worker record yet, so you cannot sign on yourself. Ask your supervisor to sign you on.</div>}
          <section>
            <h2 className="m-0 mb-2 text-[15px] font-semibold">To sign on</h2>
            <div className="bg-white border border-line rounded-xl overflow-hidden">
              {todo.length === 0 ? <p className="m-0 p-3.5 text-sm text-muted">Nothing waiting for you.</p> : todo.map(t => (
                <a key={t.swms.id} href={`#/swms/${t.swms.id}`} className={row}>
                  <span className="flex-1 min-w-0"><span className="block text-[15px] font-medium">{t.swms.title}</span><span className="block text-[13px] text-muted mt-0.5">{t.job?.name}</span></span>
                  <Pill tone={t.again ? 'amber' : 'blue'}>{t.again ? 'Sign again' : 'Sign on'}</Pill>
                </a>
              ))}
            </div>
          </section>
          <section>
            <h2 className="m-0 mb-2 text-[15px] font-semibold">All approved SWMS</h2>
            <input type="search" aria-label="Search SWMS" placeholder="Search SWMS" value={q} onChange={e => setQ(e.target.value)} className="w-full min-h-11 mb-2 rounded-lg border border-[#D6D2CC] bg-white px-3 text-[15px]" />
            <div className="bg-white border border-line rounded-xl overflow-hidden">
              {list.length === 0 ? <p className="m-0 p-3.5 text-sm text-muted">No approved SWMS{site ? ' for this site' : ''}.</p> : list.map(s => {
                const cur = currentApproved(versions.filter(v => v.swms_id === s.id))!;
                const signed = mine ? cellFor(mine, s.id, versions, signons) : 'none';
                const when = signons.find(x => x.person_id === mine && x.version_id === cur.id)?.signed_at;
                return (
                  <a key={s.id} href={`#/swms/${s.id}`} className={row}>
                    <span className="flex-1 min-w-0"><span className="block text-[15px] font-medium">{s.title}</span><span className="block text-[13px] text-muted mt-0.5">{s.swms_number ? `SWMS ${s.swms_number}` : s.ref} · version {cur.version}{when ? ` · signed ${formatDay(when.slice(0, 10))}` : ''}</span></span>
                    {signed === 'signed' ? <Pill tone="green">Signed on</Pill> : signed === 'older' ? <Pill tone="amber">Sign again</Pill> : <Pill tone="grey">Read</Pill>}
                  </a>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
