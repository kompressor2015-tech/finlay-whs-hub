import { formatDay } from '../utils/dates.ts';
import { COMPANY } from '../utils/swms.ts';
import type { RegisterRow } from '../utils/swmsRegister.ts';

const cell = 'border border-[#2A6FA8] px-2 py-1 align-top';
const head = `${cell} bg-[#D9E5F3] font-bold`;

/** The SWMS register, laid out like Finlay's Word register. Only shows when printing. */
export function SwmsRegisterPrint({ rows, project }: { rows: RegisterRow[]; project: string }) {
  const blanks = Math.max(0, 18 - rows.length);
  return (
    <div className="hidden print:block text-[11px] leading-snug text-black">
      <style>{'@page { size: A4 landscape; margin: 10mm; }'}</style>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[22px] font-medium font-sans">Safe Work Method Statement (SWMS) REGISTER</div>
        <img src="/finlay-logo.jpg" alt="Finlay" className="h-10" />
      </div>
      <p className="m-0 mb-2"><b>PROJECT NAME:</b> {project}</p>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={head}>SWMS No</th><th className={head}>Risk register ref</th><th className={head}>SWMS Title</th><th className={head}>Date Works Commenced</th>
            <th className={head}>Review Date</th><th className={head}>Review Date</th><th className={head}>Review Date</th><th className={head}>Review Date</th><th className={head}>Revision No</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={`${r.no}-${r.title}`}>
              <td className={cell}>{r.no}</td><td className={cell}>{r.riskRef}</td><td className={cell}>{r.title}</td><td className={cell}>{r.commenced ? formatDay(r.commenced) : ''}</td>
              {[0, 1, 2, 3].map(i => <td key={i} className={cell}>{r.reviews[i] ? formatDay(r.reviews[i]) : ''}</td>)}
              <td className={cell}>{r.revision}</td>
            </tr>
          ))}
          {Array.from({ length: blanks }, (_, i) => <tr key={`b${i}`}>{Array.from({ length: 9 }, (_, j) => <td key={j} className={`${cell} h-5`} />)}</tr>)}
        </tbody>
      </table>
      <p className="mt-2 text-[10px]">{COMPANY.name} · printed {formatDay(new Date().toISOString().slice(0, 10))}</p>
    </div>
  );
}
