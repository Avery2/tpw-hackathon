// Runs the real .gs files on your own computer, with pretend Google services, so the form and
// sign-in can be tried without deploying anything. No packages needed.
//
//   node apps-script/local-server.js            then set window.TPW_BACKEND_URL in
//                                               form-demo/backend.js to http://localhost:8813/
//
// What's pretend: the spreadsheet lives in memory (GET /sheet shows it), and code emails are
// printed here instead of sent (GET /outbox lists them). The Members tab starts with the demo
// rows below. Everything else is the code that runs on Google.
//
// Also used by signin-tests.js, which loads the same pretend services without the web server.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');
const crypto = require('crypto');

const DEMO_MEMBERS = [
  ['Email or @domain', 'Organization', 'Active', 'Notes'],
  ['staff@sunrise-reentry.example', 'Sunrise Reentry Collective (demo)', 'yes', 'one named person'],
  ['@opengate-arts.example', 'Open Gate Arts (demo)', 'yes', 'anyone at this domain'],
  ['left@secondchapter.example', 'Second Chapter Mentoring (demo)', 'no', 'switched off'],
  ['@gmail.com', 'Should Never Match (demo)', 'yes', 'free email domains are refused']
];

function load({ properties = {}, members = DEMO_MEMBERS } = {}) {
  const tabs = { Members: members.map(row => row.slice()) };
  const outbox = [];
  const cache = new Map();
  const now = () => Date.now();

  const tabOf = range => range.split('!')[0];
  const fakes = {
    console,
    PropertiesService: { getScriptProperties: () => ({ getProperty: name => (name in properties ? properties[name] : null) }) },
    CacheService: {
      getScriptCache: () => ({
        get: key => { const hit = cache.get(key); if (!hit || hit.until < now()) { cache.delete(key); return null; } return hit.value; },
        put: (key, value, seconds) => cache.set(key, { value: String(value), until: now() + Math.min(seconds, 21600) * 1000 }),
        remove: key => cache.delete(key)
      })
    },
    Utilities: { getUuid: () => crypto.randomUUID() },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
    MailApp: { sendEmail: message => { outbox.push({ ...message, at: new Date().toISOString() }); console.log(`\n[email to ${message.to}] ${message.subject}\n`); } },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) },
    Sheets: {
      Spreadsheets: {
        get: () => ({ sheets: Object.keys(tabs).map(title => ({ properties: { title } })) }),
        batchUpdate: request => { request.requests.forEach(r => { if (r.addSheet) tabs[r.addSheet.properties.title] = []; }); },
        Values: {
          get: (id, range) => {
            const tab = tabs[tabOf(range)] || [];
            const body = /!A2:/.test(range) ? tab.slice(1) : tab.slice(0, 1);
            return body.length ? { values: body.map(row => row.slice()) } : {};
          },
          update: (request, id, range) => { tabs[tabOf(range)] = request.values.map(row => row.slice()).concat((tabs[tabOf(range)] || []).slice(1)); },
          append: (request, id, range) => { (tabs[tabOf(range)] = tabs[tabOf(range)] || []).push(...request.values.map(row => row.slice())); }
        }
      }
    }
  };
  const context = vm.createContext(fakes);
  for (const file of ['Rows.gs', 'Session.gs', 'Sheet.gs', 'SignIn.gs', 'Code.gs']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context, { filename: file });
  }
  return { context, tabs, outbox, cache };
}

module.exports = { load, DEMO_MEMBERS };

if (require.main === module) {
  const port = Number(process.env.PORT || 8813);
  const { context, tabs, outbox } = load({ properties: { SPREADSHEET_ID: 'local', TPW_CONTACT_EMAIL: 'data@tpw.example' } });
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  http.createServer((req, res) => {
    if (req.method === 'GET') {
      const body = req.url.startsWith('/sheet') ? tabs : req.url.startsWith('/outbox') ? outbox : JSON.parse(context.doGet().text);
      res.writeHead(200, cors); res.end(JSON.stringify(body, null, 2)); return;
    }
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      const out = context.doPost({ postData: { contents: raw } });
      res.writeHead(200, cors); res.end(out.text);
    });
  }).listen(port, () => console.log(`Pretend Google back end on http://localhost:${port}/  (GET /sheet, GET /outbox)`));
}
