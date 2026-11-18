// Program-level submission history CSV, with spreadsheet formula escaping.
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
