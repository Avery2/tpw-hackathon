export function loadingSkeleton(kind = 'cards') {
  const node = (className) => { const el = document.createElement('div'); el.className = className; return el; };
  const root = node(`page-skeleton page-skeleton-${kind}`); root.setAttribute('aria-hidden', 'true');
  if (kind === 'table') {
    const table = node('skeleton-table');
    for (let r = 0; r < 7; r++) {
      const row = node('skeleton-table-row');
      for (let c = 0; c < 6; c++) row.append(node('skeleton-block skeleton-cell'));
      table.append(row);
    }
    root.append(table);
  } else if (kind === 'form') {
    root.append(node('skeleton-block skeleton-title'), node('skeleton-block skeleton-description'));
    const cards = node('skeleton-facilities');
    for (let i = 0; i < 3; i++) { const card = node('skeleton-facility'); card.append(node('skeleton-block skeleton-label'), node('skeleton-block skeleton-label'), node('skeleton-block skeleton-button')); cards.append(card); }
    root.append(cards, node('skeleton-block skeleton-field'), node('skeleton-block skeleton-button'));
  } else {
    const grid = node('existing-program-grid');
    for (let i = 0; i < 4; i++) {
      const card = node('existing-program');
      for (const className of ['skeleton-title','skeleton-label','skeleton-field','skeleton-description','skeleton-field']) card.append(node(`skeleton-block ${className}`));
      grid.append(card);
    }
    root.append(grid);
  }
  return root;
}
