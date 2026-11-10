/** Switches the home screen between real data and sample data (for reviewing the layout). */
export function SampleToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      title={on ? 'Showing sample data. Click to show real data.' : 'Show sample data to preview the layout'}
      className={`h-8 px-3 rounded-full text-xs font-semibold cursor-pointer border ${
        on ? 'bg-[#FFF1D6] text-[#7A4A00] border-[#F2D9A6]' : 'bg-white text-muted border-line'
      }`}
    >
      {on ? 'Sample data on' : 'Sample data'}
    </button>
  );
}
