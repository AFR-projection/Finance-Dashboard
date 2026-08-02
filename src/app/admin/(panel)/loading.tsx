/** Shares the ink surface so navigation never flashes the light app background. */
export default function AdminPanelLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-ink-soft" />
        <div className="h-7 w-56 rounded-lg bg-ink-soft" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-36 rounded-3xl border border-ink-border bg-ink-soft/40" />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="h-80 rounded-3xl border border-ink-border bg-ink-soft/40 lg:col-span-2" />
        <div className="h-80 rounded-3xl border border-ink-border bg-ink-soft/40" />
      </div>
    </div>
  );
}
