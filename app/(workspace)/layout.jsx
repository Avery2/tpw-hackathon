import Workspace from './team-dashboard/workspace.jsx';

export default function DashboardLayout({ children }) {
  return <>
    <link rel="stylesheet" href="/team-dashboard/workspace.css?v=chart-motion-1" />
    <link rel="stylesheet" href="/team-dashboard/loading.css" />
    <link rel="stylesheet" href="/assets/site-shell.css?v=account-regular-1" />
    <link rel="stylesheet" href="/assets/account-drawer.css" />
    <link rel="stylesheet" href="/assets/dashboard-exports.css" />
    <style>{`.tpw-site { background: #fff; }`}</style>
    <Workspace>{children}</Workspace>
  </>;
}
