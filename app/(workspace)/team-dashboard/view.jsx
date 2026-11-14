'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';

export default function DashboardView({ controller, css, html }) {
  const host = useRef(null);
  const search = useSearchParams().toString();
  useEffect(() => {
    const root = host.current;
    // React owns the host. The existing controller owns only this view's DOM.
    root.innerHTML = html;
    let disposed = false;
    let cleanup;
    const moduleUrl = `/team-dashboard/js/${controller}.js?v=next-layout-1`;
    import(/* turbopackIgnore: true */ moduleUrl).then(module => {
      if (!disposed) cleanup = module.mountDashboardView(root);
    }).catch(error => {
      if (!disposed) root.textContent = 'Could not load this dashboard view.';
      console.error(error);
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [controller, html, search]);
  return <>
    <style>{css}</style>
    <main className="dashboard-layout" ref={host} />
  </>;
}
