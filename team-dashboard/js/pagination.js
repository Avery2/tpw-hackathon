export function appendPagination(container, result, navigate) {
  if (result.pages <= 1) return;
  const nav = document.createElement('nav');
  nav.className = 'tracker-pagination';
  nav.setAttribute('aria-label', 'Results pages');
  const status = document.createElement('span');
  status.textContent = `Page ${result.page} of ${result.pages}`;
  for (const [label, delta] of [['Previous', -1], ['Next', 1]]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    const page = result.page + delta;
    button.disabled = page < 1 || page > result.pages;
    button.addEventListener('click', () => navigate(page));
    if (delta === 1) nav.append(status);
    nav.append(button);
  }
  container.append(nav);
}
