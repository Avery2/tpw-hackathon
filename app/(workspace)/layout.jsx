import Workspace from './team-dashboard/workspace.jsx';

export default function DashboardLayout({ children }) {
  return <>
    <link rel="preload" href="/assets/fonts/rubik-one.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
    <link rel="preload" href="/assets/fonts/degular-text-700.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
    <link rel="stylesheet" href="/team-dashboard/workspace.css?v=chart-motion-1" />
    <link rel="stylesheet" href="/team-dashboard/loading.css" />
    <link rel="stylesheet" href="/assets/site-shell.css?v=account-regular-1" />
    <link rel="stylesheet" href="/assets/account-drawer.css" />
    <link rel="stylesheet" href="/assets/dashboard-exports.css" />
    <style>{`
      @font-face {
        font-family: 'TPW Dashboard Title';
        src: url('/assets/fonts/rubik-one.woff2') format('woff2');
        font-weight: 400;
        font-display: swap;
      }
      html:has(.tpw-member-nav) { scrollbar-gutter: stable; }
      .tpw-site { background: #fff; }
      .tpw-site .dashboard-layout .dashboard-heading h1,
      .tpw-site .tpw-workspace .tpw-page-title {
        font: 400 clamp(2rem, 4vw, 3rem)/1.15 'TPW Dashboard Title', sans-serif;
      }
      #submission-choice-heading {
        font-family: var(--tpw-text);
        font-size: clamp(25px, 3vw, 34px);
        font-weight: 700;
        line-height: 1.15;
        margin: 10px 0;
      }
      .tpw-site .tpw-member-nav a[aria-current="page"] {
        font-weight: 500;
        text-shadow: 0.35px 0 currentColor, -0.35px 0 currentColor;
      }
    `}</style>
    <Workspace>{children}</Workspace>
  </>;
}
