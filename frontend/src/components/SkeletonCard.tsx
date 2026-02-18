/** Skeleton loading primitives for the dashboard. */

/** A single metric card skeleton. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={`app-card dashboard-card animate-pulse ${className ?? ""}`}>
      <div className="h-3 w-1/3 rounded-full bg-[var(--md-sys-color-surface-variant)] mb-4" />
      <div className="h-8 w-1/2 rounded bg-[var(--md-sys-color-surface-variant)] mb-2" />
      <div className="h-3 w-2/3 rounded-full bg-[var(--md-sys-color-surface-variant)] opacity-60" />
    </div>
  );
}

/** A chart panel skeleton with a title bar + body placeholder. */
export function SkeletonChart({ className }: { className?: string }) {
  return (
    <div className={`app-card dashboard-card animate-pulse ${className ?? ""}`}>
      <div className="h-4 w-1/4 rounded-full bg-[var(--md-sys-color-surface-variant)] mb-4" />
      <div className="h-48 w-full rounded-lg bg-[var(--md-sys-color-surface-variant)] opacity-50" />
    </div>
  );
}

/**
 * Full-page skeleton that mirrors the rough layout of ProjectDashboard
 * and prevents the jarring "blank → content" flash during initial load.
 */
export function DashboardSkeleton() {
  return (
    <div className="dashboard-page text-[var(--md-sys-color-on-surface)]">
      {/* Header row */}
      <div className="flex justify-between items-center mb-6 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="h-9 w-36 rounded bg-[var(--md-sys-color-surface-variant)]" />
          <div className="h-5 w-16 rounded bg-[var(--md-sys-color-surface-variant)]" />
          <div className="h-5 w-28 rounded bg-[var(--md-sys-color-surface-variant)]" />
        </div>
        <div className="h-10 w-40 rounded-lg bg-[var(--md-sys-color-surface-variant)]" />
      </div>

      {/* Crawl config form */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl animate-pulse">
        <div className="h-16 rounded-lg bg-[var(--md-sys-color-surface-variant)]" />
        <div className="h-16 rounded-lg bg-[var(--md-sys-color-surface-variant)]" />
      </div>

      {/* Site health card */}
      <div className="mb-6 app-card dashboard-card animate-pulse flex items-center justify-between">
        <div className="space-y-3">
          <div className="h-3 w-20 rounded-full bg-[var(--md-sys-color-surface-variant)]" />
          <div className="h-12 w-16 rounded bg-[var(--md-sys-color-surface-variant)]" />
          <div className="h-3 w-36 rounded-full bg-[var(--md-sys-color-surface-variant)]" />
        </div>
        <div className="w-28 h-28 rounded-full bg-[var(--md-sys-color-surface-variant)]" />
      </div>

      {/* Issue breakdown cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 dashboard-grid dashboard-section">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>

      {/* Technical health section */}
      <div className="app-card dashboard-card dashboard-section animate-pulse">
        <div className="h-6 w-1/3 rounded bg-[var(--md-sys-color-surface-variant)] mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 rounded-lg bg-[var(--md-sys-color-surface-variant)]"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="h-40 rounded-lg bg-[var(--md-sys-color-surface-variant)]" />
          <div className="h-40 rounded-lg bg-[var(--md-sys-color-surface-variant)]" />
          <div className="h-40 rounded-lg bg-[var(--md-sys-color-surface-variant)] opacity-50" />
        </div>
      </div>

      {/* Authority + Backlink trend charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 dashboard-grid dashboard-section">
        <SkeletonChart />
        <SkeletonChart />
      </div>

      {/* ROI + analytics metric skeletons */}
      <div className="grid grid-cols-1 md:grid-cols-4 dashboard-grid dashboard-section">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
