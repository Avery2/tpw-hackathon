// Exports the dashboard's program-level history, not per-yard source records.
// Demo selectors are not authentication. A real deployment needs server-scoped exports.
import { getDemoAccount } from './member-session.js';

export function csvCell(value) {
  if (value === null || value === undefined) value = '';
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    value = String(value);
    if (/^[\s\x00-\x20\x7f]*[=+@-]/.test(value) || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\t]/.test(value)) value = "'" + value;
  }
  return '"' + String(value).replaceAll('"', '""') + '"';
}

export function programHistoryCsv(submissions) {
  const rows = [[
    'Organization', 'Organization ID', 'Submission ID', 'Submitted At', 'Reporting year', 'Reporting quarter',
    'Program', 'Program ID', 'Status', 'Start date', 'End date', 'Course hours per participant',
    'Participants enrolled (all yards)', 'Participants completed (all yards)', 'Notes', 'Sample data', 'Coverage'
  ]];
  for (const submission of submissions) for (const program of submission.programs || []) {
    rows.push([
      submission.organization, submission.orgId, submission.id, submission.submittedAt,
      submission.reportingPeriod?.year, submission.reportingPeriod?.quarter,
      program.name, program.id, program.status, program.startDate, program.endDate, program.courseHours,
      program.unreported ? null : program.participants,
      program.unreported ? null : program.participantsCompleted,
      program.notes, submission.synthetic || submission.testData ? 'Yes' : 'No',
      'Program totals across yards; submission history, not latest-only. Do not sum revisions.'
    ]);
  }
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function appendSheetsLink(container) {
  if (!document.querySelector('#tpw-export-styles')) {
    const style = document.createElement('link'); style.id = 'tpw-export-styles'; style.rel = 'stylesheet';
    style.href = new URL('./dashboard-exports.css?v=sheets-export-1', import.meta.url).href;
    document.head.append(style);
  }
  const link = document.createElement('a');
  link.href = 'https://sheets.new'; link.target = '_blank'; link.rel = 'noopener noreferrer';
  link.textContent = 'New Google Sheet ↗';
  container.append(link);
  const help = document.createElement('small');
  help.textContent = 'Download CSV, then File → Import → Upload in the new Sheet. Turn off conversion to formulas. This creates a copy, not a sync.';
  container.append(help);
}

export function mountDashboardExports(data, requestedOrgId) {
  if (typeof document === 'undefined' || !location.pathname.includes('/team-dashboard/')) return;
  const account = getDemoAccount();
  if (!account || (account !== 'tpw' && account !== requestedOrgId)) return;
  const heading = document.querySelector('.dashboard-heading');
  if (!heading) return;
  document.querySelector('#dashboard-exports')?.remove();
  const container = document.createElement('div'); container.id = 'dashboard-exports'; container.className = 'tpw-data-exports';
  container.setAttribute('aria-label', 'Download reporting data');
  const status = document.createElement('span'); status.setAttribute('role', 'status');
  for (const format of ['csv', 'json']) {
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = format === 'csv' ? 'Export program history (CSV)' : 'Export JSON';
    button.addEventListener('click', () => {
      if (getDemoAccount() !== account) { status.textContent = 'Your account changed. Reload this page before exporting.'; return; }
      // Intersect with the displayed organization even if a response contains extra records.
      const submissions = data.submissions.filter(record => !requestedOrgId || record.orgId === requestedOrgId);
      const content = format === 'csv' ? programHistoryCsv(submissions) : JSON.stringify({
        coverage: 'Submission history, not latest-only; same records as this dashboard view.',
        orgs: data.orgs, submissions
      }, null, 2);
      const blob = new Blob([content], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' });
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `tpw-program-history-${requestedOrgId || account}.${format}`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = 'Downloaded a history snapshot. Repeated filings are not additive totals.';
    });
    container.append(button);
  }
  appendSheetsLink(container); container.append(status);
  (heading.querySelector('.shell') || heading).append(container);
}
