import { Suspense } from "react";

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { notFound } from 'next/navigation';
import Overview from '../overview.jsx';
import Submissions from '../submissions.jsx';
import SubmissionHistory from '../submission-history.jsx';
import Organizations from '../organizations.jsx';
import ProgramsPage from '../programs.jsx';

const views = ['index.html', 'programs.html', 'organizations.html', 'submissions.html', 'submission-data.html'];

export function generateStaticParams() {
  return [{ view: [] }, ...views.map(file => ({ view: [file] }))];
}

export default async function Page({ params }) {
  const { view = [] } = await params;
  const file = view[0] || 'index.html';
  if (view.length > 1 || !views.includes(file)) notFound();
  const html = await readFile(path.join(process.cwd(), 'team-dashboard', file), 'utf8');
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1].replaceAll('../assets/', '/assets/');
  if (file === 'index.html') return <><style>{css}</style><Overview /></>;
  if (file === 'programs.html') return <><style>{css}</style><ProgramsPage /></>;
  if (file === 'organizations.html') return <><style>{css}</style><Suspense><Organizations /></Suspense></>;
  if (file === 'submission-data.html') return <><style>{css}</style><SubmissionHistory /></>;
  return <><style>{css}</style><Submissions /></>;
}
