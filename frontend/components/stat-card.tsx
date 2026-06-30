type StatCardProps = {
  label: string;
  value: string;
  helper?: string;
};

export function StatCard({ label, value, helper }: StatCardProps) {
  return (
    <article className="rounded-3xl border border-brand-border bg-white p-5 shadow-card">
      <p className="text-sm font-medium text-brand-muted">{label}</p>
      <p className="mt-3 text-3xl font-bold text-brand-deep">{value}</p>
      {helper ? <p className="mt-2 text-sm text-brand-muted">{helper}</p> : null}
    </article>
  );
}
