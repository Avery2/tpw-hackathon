// Same-origin reporting requests use the signed-in browser session.
export async function reportingApi(path) {
  const response = await fetch('/api/' + path, {
    headers: { 'Content-Type': 'application/json' },
  });
  const result = await response.json().catch(() => ({
    error: 'The database API is unavailable. Run this app with npm run dev.',
  }));
  if (!response.ok) {
    throw Object.assign(new Error(result.error || 'Database request failed.'), {
      status: response.status,
    });
  }
  return result;
}
