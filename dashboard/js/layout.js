// Shared navigation for pages within the dashboard workspace.
const accounts = { 'org-1': 'Org 1', 'org-2': 'Org 2', tpw: 'TPW View' };
export function updateWorkspace(account, page) {
  const sidebar = document.querySelector('#dashboard-sidebar');
  const name = accounts[account];
  document.querySelector('.dashboard-layout').classList.toggle('choosing-account', !name);
  sidebar.hidden = !name;
  if (!name) return;
  sidebar.querySelector('[data-account-name]').textContent = name;
  sidebar.querySelector('[data-account-initials]').textContent = account === 'tpw' ? 'TPW' : name.slice(-1).padStart(2, '0');
  sidebar.querySelector('[data-account-type]').textContent = account === 'tpw' ? 'Network overview' : 'Organization workspace';
  const links = [
    { page: 'overview', label: 'Overview', href: `./#${account}`, icon: 'overview' },
    { page: 'programs', label: 'Programs', href: `./programs.html#${account}`, icon: 'programs' }
  ];
  if (account !== 'tpw') links.push({ page: 'checkin', label: 'Check in', href: `./checkin.html#${account}`, icon: 'programs' });
  const nav = sidebar.querySelector('nav'); nav.replaceChildren();
  const paths = {
    overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    programs: 'M4 4h16v16H4z M4 10h16 M10 4v16'
  };
  for (const item of links) {
    const link = document.createElement('a'); link.href = item.href;
    if (page === item.page) link.setAttribute('aria-current', 'page');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, value] of Object.entries({viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'aria-hidden': 'true'})) svg.setAttribute(key, value);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', paths[item.icon]); svg.append(path);
    link.append(svg, document.createTextNode(item.label)); nav.append(link);
  }
}
