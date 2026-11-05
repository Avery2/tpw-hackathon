import {
  enableNeonMode, disableNeonMode, signIn, signUp, signOut,
  getSession, fetchContext, AuthRequiredError, AuthCookieError, NeonRequestError
} from '../assets/neon-auth-client.js?v=data-api-1';

const $ = id => document.getElementById(id);
let isSignUp = false;
let signedIn = false;
let busy = false;

function setBusy(value) {
  busy = value;
  for (const button of document.querySelectorAll('button')) button.disabled = value;
  $('auth-form').setAttribute('aria-busy', String(value));
  $('sheets-link').setAttribute('aria-disabled', String(value));
}
function clearMessages() {
  $('error').hidden = true;
  $('error').textContent = '';
  $('notice').textContent = '';
}
function showError(error) {
  // Only our fixed, local error messages are safe to show.
  $('error').textContent = error instanceof AuthRequiredError || error instanceof AuthCookieError || error instanceof NeonRequestError
    ? error.message : 'The Neon sandbox could not complete this request. Your entries are still here. Please try again or contact TPW.';
  $('error').hidden = false;
}
function showSignedOut() {
  signedIn = false;
  $('signed-out').hidden = false;
  $('signed-in').hidden = true;
  $('destinations').hidden = true;
  $('organizations').replaceChildren();
  $('user-id').value = '';
  $('identity').textContent = '';
}
function showSignedIn(session) {
  signedIn = true;
  $('signed-out').hidden = true;
  $('signed-in').hidden = false;
  $('identity').textContent = session.user.email || session.user.name || 'Neon sandbox account';
  $('user-id').value = session.user.id;
  $('access-message').textContent = 'Checking your organization access…';
  $('destinations').hidden = true;
  $('organizations').replaceChildren();
}
function showContext(context) {
  const assigned = context.isStaff || context.orgs.length > 0;
  $('access-message').textContent = context.isStaff
    ? 'TPW staff · all organizations'
    : context.orgs.length > 0 ? 'Your organization access:'
      : 'Access pending. Share your user ID with TPW.';
  $('organizations').hidden = context.isStaff || !context.orgs.length;
  $('organizations').replaceChildren(...(context.isStaff ? [] : context.orgs).map(org => {
    const item = document.createElement('li');
    item.textContent = org.name;
    return item;
  }));
  $('destinations').hidden = !assigned;
  if (assigned) {
    // Fixed local destinations only. Never consume next/redirectTo from the URL.
    $('intake-link').href = '../intake/simple.html?backend=neon';
    $('dashboard-link').href = `../team-dashboard/?backend=neon#${encodeURIComponent(context.accountKey)}`;
  }
}
async function loadContext() {
  try { showContext(await fetchContext()); }
  catch (error) {
    $('destinations').hidden = true;
    $('access-message').textContent = 'Your organization access could not be checked. Refresh access to try again.';
    if (error instanceof AuthRequiredError) showSignedOut();
    throw error;
  }
}
$('toggle-mode').addEventListener('click', () => {
  if (busy) return;
  isSignUp = !isSignUp;
  clearMessages();
  $('name-field').hidden = !isSignUp;
  $('name').disabled = !isSignUp;
  $('name').required = isSignUp;
  $('password').autocomplete = isSignUp ? 'new-password' : 'current-password';
  $('password').minLength = isSignUp ? 8 : 1;
  $('password-help').hidden = !isSignUp;
  $('password-help').textContent = isSignUp ? 'At least 8 characters. Use a new password.' : '';
  $('form-title').textContent = isSignUp ? 'Create an account' : 'Sign in';
  $('submit').textContent = isSignUp ? 'Create account' : 'Sign in';
  $('toggle-prompt').textContent = isSignUp ? 'Already have an account?' : 'New here?';
  $('toggle-mode').textContent = isSignUp ? 'Sign in' : 'Create an account';
  (isSignUp ? $('name') : $('email')).focus();
});
$('auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !$('auth-form').reportValidity()) return;
  clearMessages();
  setBusy(true);
  $('notice').textContent = isSignUp ? 'Creating your account…' : 'Signing in…';
  try {
    const session = isSignUp
      ? await signUp($('name').value.trim(), $('email').value.trim(), $('password').value)
      : await signIn($('email').value.trim(), $('password').value);
    // Keep all entries on failure; clear the password only after verified sign-in.
    $('password').value = '';
    showSignedIn(session);
    $('notice').textContent = '';
    await loadContext();
  } catch (error) {
    $('notice').textContent = '';
    showError(error);
  } finally { setBusy(false); }
});
$('sign-out').addEventListener('click', async () => {
  if (busy) return;
  clearMessages(); setBusy(true);
  try {
    await signOut();
    showSignedOut();
    $('password').value = '';
    $('notice').textContent = 'Signed out of Neon.';
  } catch (error) {
    $('destinations').hidden = true;
    showError(error);
  } finally { setBusy(false); }
});
$('refresh-access').addEventListener('click', async () => {
  if (busy) return;
  clearMessages(); setBusy(true);
  try { await loadContext(); }
  catch (error) { showError(error); }
  finally { setBusy(false); }
});
$('copy-id').addEventListener('click', async () => {
  if (busy || !signedIn) return;
  try {
    await navigator.clipboard.writeText($('user-id').value);
    $('notice').textContent = 'User ID copied.';
  } catch {
    $('user-id').focus(); $('user-id').select();
    $('notice').textContent = 'Copy is not available here. Your user ID is selected; copy it using your browser’s Copy command.';
  }
});
$('sheets-link').addEventListener('click', async event => {
  event.preventDefault();
  if (busy) return;
  clearMessages(); setBusy(true);
  try {
    // Always attempt remote sign-out, even if the initial session check failed.
    await signOut();
    disableNeonMode();
    window.location.assign(new URL('../intake/simple.html?backend=sheet', window.location.href).href);
  } catch (error) { showError(error); }
  finally { setBusy(false); }
});

async function start() {
  // This page is the sole persistent opt-in, not a query read on other pages.
  // An explicit ?backend=sheet is a mode-off route, not a sign-in attempt.
  if (new URL(window.location.href).searchParams.get('backend') === 'sheet') {
    disableNeonMode();
    window.location.replace(new URL('../intake/simple.html?backend=sheet', window.location.href).href);
    return;
  }
  enableNeonMode();
  setBusy(true);
  try {
    const session = await getSession();
    if (session) { showSignedIn(session); await loadContext(); }
    else showSignedOut();
  } catch (error) {
    if (!signedIn) showSignedOut();
    showError(error);
  } finally { $('loading').hidden = true; setBusy(false); }
}
start();
