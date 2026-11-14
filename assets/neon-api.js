// Calls our server only. Database credentials never enter the browser.
const root = new URL('../', import.meta.url);
export async function demoApi(path, options={}) {
  const response=await fetch(new URL(`api/${path}`,root),{...options,headers:{'Content-Type':'application/json',...options.headers}});
  const result=await response.json().catch(()=>({error:'The database API is unavailable. Run this app with npm run dev.'}));
  if(!response.ok)throw new Error(result.error || 'Database request failed.');
  return result;
}
