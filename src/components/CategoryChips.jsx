/** Horizontal filter chips shared by the bill grid and the Products screen. */
export default function CategoryChips({ options, value, onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3" role="group" aria-label="Filter">
      {options.map(({ value: v, label }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={`flex-shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
            value === v ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 active:bg-slate-200'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
