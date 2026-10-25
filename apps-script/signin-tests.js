// Checks the emailed-code sign-in (SignIn.gs) and that filing uses the signed-in organization,
// with pretend Google services. Run `node apps-script/signin-tests.js` from the repo root.
// No packages needed. Exits non-zero if anything fails.

const assert = require('assert');
const { load } = require('./local-server.js');

const plain = value => JSON.parse(JSON.stringify(value));
const fresh = () => load({ properties: { SPREADSHEET_ID: 'test', TPW_CONTACT_EMAIL: 'data@tpw.example' } });
const lastCode = outbox => outbox[outbox.length - 1].subject.match(/(\d{6})$/)[1];
const post = (context, body) => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(body) } }).text);
const program = {
  name: 'Prog A', status: 'Completed', startDate: '2026-09-01', endDate: '2026-10-01', courseHours: 20,
  sites: [{ facilityCode: 'SQ', yard: 'North', participants: 10, completed: 8 }]
};

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok  ', name); }
  catch (error) { console.log('FAIL', name, '\n     ', error.message); process.exitCode = 1; }
}

test('a member gets a code; a stranger gets the same reply and no email', () => {
  const { context, outbox } = fresh();
  const member = plain(context.requestCode('Staff@Sunrise-Reentry.example '));
  const stranger = plain(context.requestCode('cowboy@example.com'));
  assert.deepStrictEqual(member, stranger, 'replies must not reveal who is a member');
  assert.strictEqual(member.ok, true);
  assert.strictEqual(member.contact, 'data@tpw.example');
  assert.strictEqual(outbox.length, 1);
  assert.strictEqual(outbox[0].to, 'staff@sunrise-reentry.example');
  assert.match(outbox[0].subject, /^Your TPW form code: \d{6}$/);
});

test('the right code gives a pass for the Members tab organization', () => {
  const { context, outbox } = fresh();
  context.requestCode('staff@sunrise-reentry.example');
  const result = plain(context.verifyCode('staff@sunrise-reentry.example', lastCode(outbox)));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.organization, 'Sunrise Reentry Collective (demo)');
  assert.match(result.token, /^[a-f0-9]{64}$/);
  assert.strictEqual(result.hours, 2);
});

test('a code works once', () => {
  const { context, outbox } = fresh();
  context.requestCode('staff@sunrise-reentry.example');
  const code = lastCode(outbox);
  assert.strictEqual(context.verifyCode('staff@sunrise-reentry.example', code).ok, true);
  assert.strictEqual(context.verifyCode('staff@sunrise-reentry.example', code).ok, false);
});

test('wrong codes count down, and the fifth wrong try ends the code', () => {
  const { context, outbox } = fresh();
  context.requestCode('staff@sunrise-reentry.example');
  const right = lastCode(outbox);
  const wrong = right === '000000' ? '111111' : '000000';
  for (let i = 1; i <= 4; i++) {
    const r = plain(context.verifyCode('staff@sunrise-reentry.example', wrong));
    assert.match(r.errors[0], new RegExp(`${5 - i} tr(y|ies) left`));
  }
  assert.match(context.verifyCode('staff@sunrise-reentry.example', wrong).errors[0], /Too many wrong tries/);
  assert.strictEqual(context.verifyCode('staff@sunrise-reentry.example', right).ok, false, 'even the right code is dead now');
});

test('a domain row lets anyone at that domain in', () => {
  const { context, outbox } = fresh();
  context.requestCode('anyone@opengate-arts.example');
  assert.strictEqual(context.verifyCode('anyone@opengate-arts.example', lastCode(outbox)).organization, 'Open Gate Arts (demo)');
});

test('a gmail.com domain row is ignored', () => {
  const { context, outbox } = fresh();
  context.requestCode('someone@gmail.com');
  assert.strictEqual(outbox.length, 0);
});

test('a row marked "no" is switched off', () => {
  const { context, outbox } = fresh();
  context.requestCode('left@secondchapter.example');
  assert.strictEqual(outbox.length, 0);
});

test('a second code request within a minute is refused, for members and strangers alike', () => {
  const { context } = fresh();
  context.requestCode('staff@sunrise-reentry.example');
  context.requestCode('cowboy@example.com');
  assert.match(context.requestCode('staff@sunrise-reentry.example').errors[0], /wait a minute/);
  assert.match(context.requestCode('cowboy@example.com').errors[0], /wait a minute/);
});

test('switching a member off after the code was sent stops the sign-in', () => {
  const { context, outbox, tabs } = fresh();
  context.requestCode('staff@sunrise-reentry.example');
  tabs.Members[1][2] = 'no';
  assert.strictEqual(context.verifyCode('staff@sunrise-reentry.example', lastCode(outbox)).ok, false);
});

test('a bad email is refused before anything happens', () => {
  const { context, outbox } = fresh();
  assert.strictEqual(context.requestCode('not an email').ok, false);
  assert.strictEqual(outbox.length, 0);
});

test('the Members tab is made with its header if missing', () => {
  const { context, tabs } = load({ properties: { SPREADSHEET_ID: 'test' }, members: [] });
  delete tabs.Members;
  context.requestCode('someone@example.org');
  assert.deepStrictEqual(plain(tabs.Members[0]), ['Email or @domain', 'Organization', 'Active', 'Notes']);
});

test('through doPost: sign in, then file; rows go under the signed-in organization, not the page\'s', () => {
  const { context, outbox, tabs } = fresh();
  assert.strictEqual(post(context, { action: 'requestCode', email: 'staff@sunrise-reentry.example' }).ok, true);
  const signedIn = post(context, { action: 'verifyCode', email: 'staff@sunrise-reentry.example', code: lastCode(outbox) });
  const filed = post(context, { token: signedIn.token, payload: { organization: 'Pretend To Be GRIP', programs: [program] } });
  assert.strictEqual(filed.ok, true, JSON.stringify(filed));
  const row = tabs.Submissions[tabs.Submissions.length - 1];
  assert.strictEqual(row[2], 'Sunrise Reentry Collective (demo)');
  assert.strictEqual(row[16], 'staff@sunrise-reentry.example');
  assert.strictEqual(row[17], 'Yes');
});

test('filing without a pass is refused and asks for sign-in', () => {
  const { context, tabs } = fresh();
  const filed = post(context, { token: '', payload: { organization: 'Anyone', programs: [program] } });
  assert.strictEqual(filed.ok, false);
  assert.strictEqual(filed.signInNeeded, true);
  assert.strictEqual(tabs.Submissions, undefined);
});

test('the pass-making functions are private (end in "_"), so a served page can\'t call them', () => {
  const { context } = fresh();
  assert.strictEqual(typeof context.createSession, 'undefined');
  assert.strictEqual(typeof context.createSession_, 'function');
});

console.log(`\n${passed} passed`);
