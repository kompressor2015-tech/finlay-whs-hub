import { useEffect, useState } from 'react';
import type { WhsUser } from '../services/auth.ts';
import { RisksPage } from './RisksPage.tsx';
import { SwmsListPage } from './SwmsListPage.tsx';

type Tab = 'register' | 'swms';
const fromHash = (): Tab => (/^#\/m\/risk\/swms/.test(window.location.hash) ? 'swms' : 'register');

/** Risk & SWMS: two tabs, the risk register and the SWMS list. The tab is kept in the address so Back works. */
export function RiskModule({ user }: { user: WhsUser }) {
  const [tab, setTab] = useState<Tab>(fromHash);
  useEffect(() => {
    const on = () => setTab(fromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const pick = (t: Tab) => { window.location.hash = t === 'swms' ? '#/m/risk/swms' : '#/m/risk'; };
  const tabCls = (on: boolean) => `min-h-11 px-4 text-[15px] font-semibold cursor-pointer border-0 bg-transparent border-b-[3px] ${on ? 'text-finlay border-b-finlay' : 'text-muted border-b-transparent hover:text-ink'}`;
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Risk and SWMS" className="flex gap-2 border-b border-line">
        <button type="button" role="tab" aria-selected={tab === 'register'} onClick={() => pick('register')} className={tabCls(tab === 'register')}>Risk register</button>
        <button type="button" role="tab" aria-selected={tab === 'swms'} onClick={() => pick('swms')} className={tabCls(tab === 'swms')}>SWMS</button>
      </div>
      {tab === 'register' ? <RisksPage user={user} /> : <SwmsListPage user={user} />}
    </div>
  );
}
