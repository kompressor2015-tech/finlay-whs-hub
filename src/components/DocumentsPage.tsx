import { useEffect, useMemo, useState } from 'react';
import type { WhsUser } from '../services/auth.ts';
import { listAllVersions, listDocuments } from '../services/documents.ts';
import { hrefFor } from '../hooks/useRoute.ts';
import { useSiteScope } from '../hooks/useSiteScope.tsx';
import { isOfficeAccess } from '../utils/access.ts';
import { DOC_TYPES, currentVersion, docTypeLabel, fileKind, reviewPill, reviewState, type DocType, type DocVersion, type WhsDocument } from '../utils/documents.ts';
import { looseMatch } from '../utils/search.ts';
import { ErrorNote } from './Form.tsx';
import { Pill } from './Pill.tsx';
import { SidePanel, linkOpens, rowOpens, useListPanel } from './SidePanel.tsx';
import { DocumentDetail } from './DocumentDetail.tsx';
import { AddDocumentForm, BulkDocumentUpload } from './DocumentTools.tsx';

type Filter = 'all' | 'overdue' | 'soon' | 'none';

const th = 'px-2 py-3 font-semibold border-b border-[#EEEBE6] text-left';
const td = 'px-2 py-3 border-b border-line-soft align-top';

/** The Documents library: management system, work instructions, SWMS, machine risk assessments, policies and forms. */
export function DocumentsPage({ user }: { user: WhsUser }) {
  const office = isOfficeAccess(user.access);
  const { site, sites } = useSiteScope();
  const [docs, setDocs] = useState<WhsDocument[]>([]);
  const [versions, setVersions] = useState<DocVersion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<DocType | 'all'>('all');
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState<'one' | 'many' | null>(null);

  const load = () =>
    Promise.all([listDocuments(), listAllVersions()]).then(([d, v]) => {
      setError(d.error ?? v.error ?? null);
      setDocs(d.data ?? []);
      setVersions(v.data ?? []);
      setLoaded(true);
    });
  useEffect(() => {
    void load();
  }, []);

  const versionsOf = useMemo(() => {
    const m = new Map<string, DocVersion[]>();
    for (const v of versions) m.set(v.document_id, [...(m.get(v.document_id) ?? []), v]);
    return m;
  }, [versions]);

  // A document applies to every site unless it was set to one site
  const inSite = useMemo(() => docs.filter(d => !site || !d.site_id || d.site_id === site.id), [docs, site]);
  const counts = useMemo(() => ({
    overdue: inSite.filter(d => reviewState(d) === 'overdue').length,
    soon: inSite.filter(d => reviewState(d) === 'due_soon').length,
    none: inSite.filter(d => reviewState(d) === 'none').length,
  }), [inSite]);

  const shown = useMemo(
    () =>
      inSite.filter(d => {
        if (tab !== 'all' && d.doc_type !== tab) return false;
        const s = reviewState(d);
        if (filter === 'overdue' && s !== 'overdue') return false;
        if (filter === 'soon' && s !== 'due_soon') return false;
        if (filter === 'none' && s !== 'none') return false;
        return looseMatch(q, [d.doc_no, d.title, d.machine_model, d.owner_name, docTypeLabel(d.doc_type)]);
      }),
    [inSite, tab, filter, q]
  );

  const panel = useListPanel(() => shown.map(d => d.id), () => void load());
  const siteName = (id: string | null) => (id ? sites.find(s => s.id === id)?.name.replace(/ (Yard|Workshop|Site)$/, '') ?? id : 'All sites');

  const tabs: { id: DocType | 'all'; label: string; n: number }[] = [
    { id: 'all', label: 'All', n: inSite.length },
    ...DOC_TYPES.map(t => ({ id: t.id, label: t.label, n: inSite.filter(d => d.doc_type === t.id).length })),
  ];
  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'overdue', label: `Review overdue (${counts.overdue})` },
    { id: 'soon', label: `Due in 90 days (${counts.soon})` },
    { id: 'none', label: `No review date (${counts.none})` },
  ];
  const stat = (label: string, value: number, sub: string, color = '') => (
    <div className="bg-white border border-line rounded-xl px-4 py-3.5">
      <div className="text-muted text-[13px]">{label}</div>
      <div className={`text-[26px] font-bold mt-0.5 ${color}`}>{value}</div>
      <div className="text-muted text-xs mt-0.5">{sub}</div>
    </div>
  );
  const rowCls = (id: string) => `cursor-pointer ${panel.openId === id ? 'bg-finlay-soft' : 'hover:bg-[#FAFAF9]'}`;

  return (
    <div className="flex gap-5 items-start">
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        <div className="flex flex-wrap justify-between items-end gap-3">
          <div>
            <h1 className="m-0 text-[26px] font-bold">Documents{site && <span className="text-finlay-dark font-semibold"> · {site.name}</span>}</h1>
            <p className="mt-1.5 mb-0 text-muted text-[15px]">Management system, work instructions, SWMS, machine risk assessments, policies and forms, each with versions and a review date.</p>
          </div>
          {office && (
            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={() => setAdding(adding === 'many' ? null : 'many')} className="min-h-11 px-3.5 rounded-lg border border-[#D6D2CC] bg-white text-sm font-semibold cursor-pointer">Upload many files</button>
              <button type="button" onClick={() => setAdding(adding === 'one' ? null : 'one')} className="min-h-11 px-4 rounded-lg bg-finlay hover:bg-finlay-dark text-white text-sm font-semibold cursor-pointer border-0">Add a document</button>
            </div>
          )}
        </div>

        {adding === 'one' && <AddDocumentForm onCancel={() => setAdding(null)} onDone={id => { setAdding(null); void load().then(() => panel.setOpenId(id)); }} />}
        {adding === 'many' && <BulkDocumentUpload existing={docs} onCancel={() => setAdding(null)} onDone={() => { setAdding(null); void load(); }} />}

        <ErrorNote message={error} />

        <section aria-label="Document review health" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stat('Documents', inSite.length, site ? `for ${site.name} and all sites` : 'in the library')}
          {stat('Review overdue', counts.overdue, 'past the review date', counts.overdue ? 'text-finlay' : '')}
          {stat('Review due in 90 days', counts.soon, 'same warning as the SDS', counts.soon ? 'text-[#7A4A00]' : '')}
          {stat('No review date yet', counts.none, 'new uploads start here', counts.none ? 'text-[#7A4A00]' : '')}
        </section>

        <div role="tablist" aria-label="Document type" className="flex flex-wrap gap-2">
          {tabs.map(t => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={`min-h-9 px-3 rounded-lg text-[13px] font-semibold cursor-pointer border ${tab === t.id ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-[#D6D2CC]'}`}>
              {t.label} <span className="opacity-70 font-medium">{t.n}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2.5 items-center">
          <label htmlFor="doc-q" className="sr-only">Filter documents</label>
          <input id="doc-q" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search by number, title or machine"
            className="flex-[1_1_240px] max-w-[360px] min-h-10 rounded-lg border border-[#D6D2CC] bg-white px-3 text-sm" />
          {filters.map(f => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}
              className={`min-h-9 px-3.5 rounded-full text-[13px] font-semibold cursor-pointer border ${filter === f.id ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-[#D6D2CC]'}`}>
              {f.label}
            </button>
          ))}
        </div>

        <div className="bg-white border border-line rounded-xl overflow-x-auto">
          <table className="w-full border-collapse text-sm min-w-[980px]">
            <thead>
              <tr className="text-muted text-xs">
                <th scope="col" className={`${th} pl-4`}>No.</th><th scope="col" className={th}>Title</th><th scope="col" className={th}>Type</th><th scope="col" className={th}>Version</th>
                <th scope="col" className={th}>Applies to</th><th scope="col" className={th}>Owner</th><th scope="col" className={th}>Review by</th><th scope="col" className={`${th} pr-4`}>File</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(d => {
                const cur = currentVersion(versionsOf.get(d.id) ?? []);
                const p = reviewPill(d);
                return (
                  <tr key={d.id} onClick={e => rowOpens(e, () => panel.setOpenId(d.id))} aria-selected={panel.openId === d.id} className={rowCls(d.id)}>
                    <td className={`${td} pl-4 whitespace-nowrap font-semibold`}>
                      <a href={hrefFor({ name: 'document', id: d.id })} onClick={e => linkOpens(e, () => panel.setOpenId(d.id))}>{d.doc_no || '—'}</a>
                    </td>
                    <td className={td}>
                      <span className="block font-medium">{d.title}</span>
                      {d.machine_model && <span className="block text-[13px] text-muted mt-0.5">Model {d.machine_model}</span>}
                    </td>
                    <td className={`${td} whitespace-nowrap`}><Pill tone="grey">{docTypeLabel(d.doc_type)}</Pill></td>
                    <td className={`${td} whitespace-nowrap text-muted`}>{cur?.version || '—'}</td>
                    <td className={`${td} whitespace-nowrap`}>{siteName(d.site_id)}</td>
                    <td className={`${td} whitespace-nowrap text-muted`}>{d.owner_name}</td>
                    <td className={`${td} whitespace-nowrap`}><Pill tone={p.tone}>{p.label}</Pill></td>
                    <td className={`${td} pr-4 whitespace-nowrap text-[13px] ${cur ? '' : 'text-finlay font-semibold'}`}>{cur ? fileKind(cur.file_name) : 'No file'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {loaded && shown.length === 0 && (
            <p className="m-0 px-4 py-8 text-sm text-muted text-center">
              {docs.length === 0 ? (office ? 'No documents yet. Use Upload many files to bring in a folder.' : 'No documents yet.') : 'Nothing matches.'}
            </p>
          )}
        </div>
      </div>
      {panel.openId && (
        <SidePanel label="Document" fullHref={hrefFor({ name: 'document', id: panel.openId })} onClose={panel.close}>
          <DocumentDetail key={panel.openId} id={panel.openId} user={user} embedded />
        </SidePanel>
      )}
    </div>
  );
}
