import { Suspense } from "react";

import { notFound } from 'next/navigation';
import Overview from '../overview.jsx';
import Submissions from '../submissions.jsx';
import SubmissionHistory from '../submission-history.jsx';
import Organizations from '../organizations.jsx';
import ProgramsPage from '../programs.jsx';
import Members from '../members.jsx';

const views = ['index.html', 'programs.html', 'organizations.html', 'submissions.html', 'submission-data.html', 'members'];

export function generateStaticParams() {
  return [{ view: [] }, ...views.map(file => ({ view: [file] }))];
}

export default async function Page({ params }) {
  const { view = [] } = await params;
  const file = view[0] || 'index.html';
  if (view.length > 1 || !views.includes(file)) notFound();
  const name = file.replace(/\.html$/, '');
  const content = {
    index: <Overview />,
    programs: <ProgramsPage />,
    organizations: <Suspense><Organizations /></Suspense>,
    'submission-data': <SubmissionHistory />,
    submissions: <Submissions />,
    members: <Members />,
  }[name];
  return <div data-dashboard-view={name} style={{ display: 'contents' }}>{content}</div>;
}
