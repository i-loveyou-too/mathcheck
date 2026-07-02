type StatCardProps = {
  label: string;
  value: string;
  helper?: string;
};

export function StatCard({ label, value, helper }: StatCardProps) {
  return (
    <article className="rounded-2xl bg-white p-4 shadow-card">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1.5 text-2xl font-black tracking-tight text-gray-900">{value}</p>
      {helper ? <p className="mt-1 text-xs leading-relaxed text-gray-400">{helper}</p> : null}
    </article>
  );
}
