export function StatCard({ label, value, icon: Icon }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-panel">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
        </div>
        {Icon && <div className="rounded-md bg-brand-50 p-3 text-brand-700"><Icon size={22} /></div>}
      </div>
    </div>
  );
}
