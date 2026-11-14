import { Suspense } from "react";

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { notFound } from 'next/navigation';
import Overview from '../overview.jsx';
import Submissions from '../submissions.jsx';
import SubmissionHistory from '../submission-history.jsx';
import Organizations from '../organizations.jsx';
import ProgramsPage from '../programs.jsx';
import DashboardView from '../view.jsx';

const views = {
  'index.html': 'main',
  'programs.html': 'programs',
  'organizations.html': 'organizations',
  'submissions.html': 'submissions-page',
  'submission-data.html': 'submission-data'
};

export function generateStaticParams() {
  return [{ view: [] }, ...Object.keys(views).filter(file => file !== 'index.html').map(file => ({ view: [file] }))];
}

export default async function Page({ params }) {
  const { view = [] } = await params;
  const file = view[0] || 'index.html';
  if (view.length > 1 || !Object.hasOwn(views, file)) notFound();
  const html = await readFile(path.join(process.cwd(), 'team-dashboard', file), 'utf8');
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1].replaceAll('../assets/', '/assets/');
  if (file === 'index.html') return <><style>{css}</style><Overview /></>;
  if (file === 'programs.html') return <><style>{css}</style><ProgramsPage /></>;
  if (file === 'organizations.html') return <><style>{css}</style><Suspense><Organizations /></Suspense></>;
  if (file === 'submission-data.html') return <><style>{css}</style><SubmissionHistory /></>;
  if (file === 'submissions.html') return <><style>{css}</style><Submissions /></>;
  const content = html.match(/<div class="workspace-content">([\s\S]*?)<\/main>/)[1];
  return <Suspense><DashboardView key={file} controller={views[file]} css={css} html={'<div class="workspace-content">' + content} /></Suspense>;
}
