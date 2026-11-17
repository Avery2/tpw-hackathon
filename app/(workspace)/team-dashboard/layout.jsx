import { readFile } from 'node:fs/promises';

const views = ['index', 'programs', 'organizations', 'submissions', 'submission-data'];

export default async function TeamDashboardLayout({ children }) {
  const styles = await Promise.all(views.map(async view => {
    const html = await readFile(`team-dashboard/${view}.html`, 'utf8');
    return html.match(/<style>([\s\S]*?)<\/style>/)[1].replaceAll('../assets/', '/assets/').split('\n');
  }));
  // Keep the shared rules mounted while changing tabs. Scope each view's
  // remaining rules so they are ready without affecting neighboring views.
  const first = styles[0];
  const sharedLength = first.findIndex((line, index) => styles.some(style => style[index] !== line));
  const shared = first.slice(0, sharedLength).join('\n');
  const scoped = views.map((view, index) => {
    const selector = view === 'programs' ? ':is([data-dashboard-view="programs"], [data-dashboard-view="members"])' :
      `[data-dashboard-view="${view}"]`;
    return `@scope (${selector}) {\n${styles[index].slice(sharedLength).join('\n')}\n}`;
  }).join('\n');

  return <><style>{shared + '\n' + scoped}</style>{children}</>;
}
