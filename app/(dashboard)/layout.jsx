import Workspace from './team-dashboard/workspace.jsx';

export default function DashboardLayout({ children }) {
  return <>
    <link rel="preload" href="/assets/fonts/rubik-one.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
    <link rel="preload" href="/assets/fonts/degular-text-700.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
    <link rel="stylesheet" href="/assets/workspace.css" />
    <link rel="stylesheet" href="/assets/workspace-loading.css" />
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
      .tpw-org-picker-wrap { position: relative; align-self: center; margin-inline-start: auto; max-inline-size: 100%; }
      .tpw-org-picker-wrap > svg { position: absolute; inset-inline-end: 12px; top: 50%; transform: translateY(-50%); pointer-events: none; }
      .tpw-member-nav .tpw-org-picker {
        max-inline-size: min(100%, 250px);
        appearance: none;
        padding: 6px 36px 6px 12px;
        border: 1px solid #d4e2d6;
        border-radius: 8px;
        background: #f5f8f4;
        color: #214c30;
        font: inherit;
      }
      @media (forced-colors: active) {
        .tpw-org-picker-wrap > svg { display: none; }
        .tpw-member-nav .tpw-org-picker { appearance: auto; }
      }
      .tpw-account-organizations { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 8px; }
      .tpw-account-organizations a { display: flex; justify-content: space-between; gap: 12px; padding: 8px 12px; border: 1px solid #d4e2d6; border-radius: 8px; color: #214c30; text-decoration: none; }
      .tpw-account-organizations a:hover, .tpw-account-organizations a[aria-current] { background: #edf6ef; }
      .tpw-account-organizations span { font-size: .85em; font-weight: 700; }
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
