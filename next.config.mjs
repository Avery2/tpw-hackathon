export default {
  trailingSlash: true,
  async redirects() {
    const aliases = {
      '/dashboard/programs.html': '/team-dashboard/programs.html',
      '/dashboard/organizations.html': '/team-dashboard/organizations.html',
      '/dashboard/submissions.html': '/team-dashboard/submissions.html',
      '/dashboard/submission-data.html': '/team-dashboard/submission-data.html',
      '/dashboard/checkin.html': '/intake/simple.html',
      '/team-form': '/intake/simple.html',
      '/team-form/index.html': '/intake/simple.html',
      '/form-demo': '/intake/simple.html',
      '/form-demo/index.html': '/intake/simple.html',
      '/intake': '/intake/simple.html',
      '/intake/index.html': '/intake/simple.html',
      '/intake/scan.html': '/intake/simple.html',
      '/intake/sheet.html': '/intake/simple.html',
      '/intake/upload.html': '/intake/simple.html',
    };
    return Object.entries(aliases).map(([source, destination]) => ({ source, destination, permanent: false }));
  },
  outputFileTracingIncludes: {
    '/**': ['./standalone/index.html', './dashboard/*.html', './form-demo/index.html', './team-form/index.html', './intake/simple.html', './team-dashboard/*.html']
  }
};
