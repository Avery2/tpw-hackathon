export default {
  trailingSlash: true,
  // The member submission history now lives on the Submissions tab; keep old links working.
  async redirects() {
    return [
      { source: '/team-dashboard/submission-data', destination: '/team-dashboard/submissions/', permanent: false },
    ];
  },
};
