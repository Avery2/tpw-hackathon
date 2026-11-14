import { HEADER, FACILITIES } from './model.mjs';

export function csvCell(value) {
  if (value === null || value === undefined) value = '';
  if (typeof value === 'object') value = JSON.stringify(value);
  // Only actual finite numbers bypass formula defenses (including negative numbers).
  if (!(typeof value === 'number' && Number.isFinite(value))) {
    value = String(value);
    if (/^[\s\x00-\x20\x7f]*[=+@-]/.test(value) || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\t]/.test(value)) value = "'" + value;
  }
  return '"' + String(value).replaceAll('"', '""') + '"';
}

export const EXPORT_HEADER = [...HEADER, 'Organization ID', 'Program ID', 'Facility code', 'Coverage / warning', 'Test data'];
export function csvExport(documents) {
  const rows = [EXPORT_HEADER];
  for (const doc of documents) {
    for (const program of doc.programs || []) {
      const sites = Array.isArray(program.sites) && program.sites.length
        ? program.sites.map(site => ({ ...site, code: site.code || site.facilityCode, detailed: true }))
        : (program.assignments || []).flatMap(a => (a.yards || []).map(yard => ({ code: a.code, yard, detailed: false })));
      // Include a placeholder for records with no site detail; JSON is the full-fidelity export.
      if (!sites.length) sites.push({ code: '', yard: '', detailed: false });
      for (const site of sites) {
        const count = site.detailed && typeof site.participants === 'number' ? site.participants : '';
        const complete = site.detailed && typeof site.completed === 'number' ? site.completed : '';
        const hours = program.courseHours ?? '';
        const warning = site.detailed && count !== '' && complete !== '' ? 'Per-yard counts reported; history (not current-only)' : 'WARNING: per-yard counts unavailable; aggregate counts retained in JSON only; history (not current-only)';
        rows.push([
          FACILITIES[site.code] || site.code, site.yard, doc.organization, program.name,
          program.status, program.startDate, program.endDate, hours, count, complete,
          typeof hours === 'number' && complete !== '' ? Math.round(hours * complete * 100) / 100 : '',
          program.startDate ? Number(program.startDate.slice(0, 4)) : '', program.notes,
          doc.id, doc.submittedAt, '', 'No', doc.reportingPeriod ? `${doc.reportingPeriod.year} Q${doc.reportingPeriod.quarter}` : '',
          doc.orgId, program.id, site.code, warning, 'Yes'
        ]);
      }
    }
    if (!(doc.programs || []).length) {
      const row = Array(EXPORT_HEADER.length).fill('');
      row[2] = doc.organization; row[13] = doc.id; row[14] = doc.submittedAt; row[18] = doc.orgId;
      row[21] = 'WARNING: no program detail; full record retained in JSON only; history (not current-only)'; row[22] = 'Yes'; rows.push(row);
    }
  }
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
