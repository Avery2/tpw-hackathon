'use client';

import Link from 'next/link';
import { useWorkspaceAccount } from './workspace.jsx';

const reportPath = account => account === 'tpw'
  ? '/report/TPW-Collective-Impact-Report-2026.pdf'
  : `/report/organizations/${account || 'org-1'}-annual-report-2026.pdf`;

export default function AnnualReport() {
  const account = useWorkspaceAccount();
  const pdf = reportPath(account);
  return <main className="dashboard-layout"><div className="workspace-content">
    <section className="dashboard-heading"><div className="shell"><h1>Annual report</h1></div></section>
    {account ? <div className="shell">
      <p className="report-actions"><a className="action" href={pdf} download>Download the PDF</a>
        <span>The report is shown below. If it does not appear, use the download link.</span></p>
      <object className="report-embed" data={pdf} type="application/pdf" aria-label="Annual report PDF">
        <p className="report-embed-fallback">This browser cannot display PDFs here. <a href={pdf} download>Download the annual report</a>.</p>
      </object>
    </div> : <Link href="/sign-in/">Choose an account</Link>}
  </div></main>;
}
