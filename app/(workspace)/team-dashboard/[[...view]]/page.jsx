import { Suspense } from "react";

import { notFound } from 'next/navigation';
import Overview from '../overview.jsx';
import Submissions from '../submissions.jsx';
import SubmissionHistory from '../submission-history.jsx';
import Organizations from '../organizations.jsx';
import ProgramsPage from '../programs.jsx';
import Members from '../members.jsx';

const views = ['programs', 'organizations', 'submissions', 'submission-data', 'members'];

export function generateStaticParams() {
  return [{ view: [] }, ...views.map(name => ({ view: [name] }))];
}

export default async function Page({ params }) {
  const { view = [] } = await params;
  if (view.length > 1 || (view.length === 1 && !views.includes(view[0]))) notFound();
  const name = view[0] || 'index';
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
