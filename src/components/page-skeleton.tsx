/** Placeholder shown while a page's data loads: the shape of a report (KPI cards, then a chart and a table) instead of a blank page. */
export function PageSkeleton({ label = "Đang tải…", kpis = 4 }: { label?: string; kpis?: number }) {
  return <div className="page-skeleton" role="status" aria-live="polite">
    <span className="sr-only">{label}</span>
    <div className="skel-kpis" aria-hidden="true">{Array.from({ length: kpis }, (_, i) => <div className="skel-card" key={i}><i className="skel w40" /><i className="skel skel-big w60" /><i className="skel w30" /></div>)}</div>
    <div className="skel-card skel-chart" aria-hidden="true"><i className="skel w30" /><i className="skel skel-fill" /></div>
    <div className="skel-card" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <i className="skel skel-row" key={i} />)}</div>
  </div>;
}

/** The whole workspace while the sign-in is checked: sidebar and top bar outlines, so the first paint is not a blank page. */
export function BootSkeleton() {
  return <div className="boot-skeleton" role="status" aria-live="polite">
    <span className="sr-only">Đang kết nối không gian làm việc…</span>
    <aside aria-hidden="true"><i className="skel skel-brand" />{Array.from({ length: 7 }, (_, i) => <i className="skel skel-nav" key={i} />)}</aside>
    <div aria-hidden="true"><i className="skel skel-top" /><PageSkeleton label="" /></div>
  </div>;
}
