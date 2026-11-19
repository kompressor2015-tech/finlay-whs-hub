import { useEffect, useState } from 'react';
import type { WhsUser } from '../services/auth.ts';
import { RisksPage } from './RisksPage.tsx';
import { SwmsListPage } from './SwmsListPage.tsx';
import { JobsPage } from './JobsPage.tsx';
import { JsaPage } from './JsaPage.tsx';
import { DocGuidePage } from './DocGuidePage.tsx';

type Tab = 'register' | 'swms' | 'jsa' | 'jobs' | 'guide';
const fromHash = (): Tab => { const h = window.location.hash; return /^#\/m\/risk\/swms/.test(h) ? 'swms' : /^#\/m\/risk\/jsa/.test(h) ? 'jsa' : /^#\/m\/risk\/jobs/.test(h) ? 'jobs' : /^#\/m\/risk\/guide/.test(h) ? 'guide' : 'register'; };

/** Risk & SWMS: two tabs, the risk register and the SWMS list. The tab is kept in the address so Back works. */
export function RiskModule({ user }: { user: WhsUser }) {
  const [tab, setTab] = useState<Tab>(fromHash);
  useEffect(() => {
    const on = () => setTab(fromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const pick = (t: Tab) => { window.location.hash = t === 'register' ? '#/m/risk' : `#/m/risk/${t}`; };
  const tabCls = (on: boolean) => `min-h-11 px-4 text-[15px] font-semibold cursor-pointer border-0 bg-transparent border-b-[3px] ${on ? 'text-finlay border-b-finlay' : 'text-muted border-b-transparent hover:text-ink'}`;
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Risk and SWMS" className="flex gap-2 border-b border-line overflow-x-auto">
        <button type="button" role="tab" aria-selected={tab === 'register'} onClick={() => pick('register')} className={tabCls(tab === 'register')}>Risk register</button>
        <button type="button" role="tab" aria-selected={tab === 'swms'} onClick={() => pick('swms')} className={tabCls(tab === 'swms')}>SWMS</button>
        <button type="button" role="tab" aria-selected={tab === 'jsa'} onClick={() => pick('jsa')} className={tabCls(tab === 'jsa')}>JSA</button>
        <button type="button" role="tab" aria-selected={tab === 'jobs'} onClick={() => pick('jobs')} className={tabCls(tab === 'jobs')}>Jobs and sign-on</button>
        <button type="button" role="tab" aria-selected={tab === 'guide'} onClick={() => pick('guide')} className={tabCls(tab === 'guide')}>Which document?</button>
      </div>
      {tab === 'register' ? <RisksPage user={user} /> : tab === 'swms' ? <SwmsListPage user={user} /> : tab === 'jsa' ? <JsaPage user={user} /> : tab === 'guide' ? <DocGuidePage /> : <JobsPage user={user} />}
    </div>
  );
}
