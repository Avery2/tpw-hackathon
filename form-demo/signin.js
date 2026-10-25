// Sign-in for the guided form. The member types their email, TPW emails them a 6-digit code
// (apps-script/SignIn.gs), and they type it here. The pass that comes back is kept in
// window.tpwSession, which the form sends with the submission. Step 1 then shows the
// organization that pass belongs to, and it can't be changed: the server files rows under the
// pass's organization whatever the page says.
//
// With no back end address in backend.js, none of this runs and the form keeps its
// browser-only demo behaviour.
(() => {
  const url = (window.TPW_BACKEND_URL || '').trim();
  const served = !!window.google?.script?.run;
  const usable = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url) || /^http:\/\/localhost:\d+\//.test(url);
  if (!usable && !served) return;

  // Same route as the submission: plain text, so the browser doesn't ask Google's server for
  // permission first.
  function call(action, email, code) {
    if (served) {
      return new Promise((resolve, reject) => google.script.run.withSuccessHandler(resolve).withFailureHandler(reject)[action](email, code));
    }
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, email, code })
    }).then(response => response.json());
  }
  const offline = 'Couldn’t reach TPW. Check your connection and try again.';

  const style = document.createElement('style');
  style.textContent = `
    .signin-step .signin-sent { display: grid; gap: 6px; padding: 14px 16px; border-radius: 10px; background: #f0f5f0; border: 1px solid #d4e2d6; }
    .signin-step .signin-sent p { margin: 0; }
    .signin-step .signin-code { max-width: 220px; letter-spacing: .3em; font-size: 24px; text-align: center; }
    .signin-step .signin-links { margin: 0; display: flex; flex-wrap: wrap; gap: 6px 18px; }
    .signin-step .link-button, .signin-out { background: transparent; border: 0; padding: 0; font: inherit; text-decoration: underline; cursor: pointer; color: inherit; }
    .signin-step .signin-feedback:empty { display: none; }
    .signin-step .signin-feedback { color: #9a3412; margin: 0; }
    #organization[readonly] { background: #f4f6f3; color: var(--ink); cursor: default; }
  `;
  document.head.append(style);

  let panels = 0;
  // One sign-in box: email, then code. Used at the start, and again if the pass runs out.
  function panel({ heading, intro, email = '', onSignedIn }) {
    const n = ++panels;
    const section = document.createElement('section');
    section.className = 'question-step signin-step';
    section.setAttribute('aria-labelledby', `signin-heading-${n}`);
    section.innerHTML = `
      <p class="step-label">Sign in</p>
      <h2 class="form-title" id="signin-heading-${n}" tabindex="-1"></h2>
      <p class="form-hint signin-intro"></p>
      <div class="form-field">
        <label for="signin-email-${n}">Email</label>
        <input id="signin-email-${n}" type="email" autocomplete="email" inputmode="email" maxlength="200" placeholder="you@yourorganization.org" required>
      </div>
      <button type="button" class="continue-button signin-send">Email me a code →</button>
      <div class="signin-code-part question-step" hidden>
        <div class="signin-sent" role="status"></div>
        <div class="form-field">
          <label for="signin-code-${n}">6-digit code</label>
          <input id="signin-code-${n}" class="signin-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}">
        </div>
        <button type="button" class="continue-button signin-verify">Sign in →</button>
        <p class="signin-links"><button type="button" class="link-button signin-resend">Send a new code</button><button type="button" class="link-button signin-change">Use a different email</button></p>
      </div>
      <p class="form-hint signin-feedback" role="alert"></p>`;
    section.querySelector('h2').textContent = heading;
    section.querySelector('.signin-intro').textContent = intro;
    const emailInput = section.querySelector('input[type="email"]');
    const codeInput = section.querySelector('.signin-code');
    const send = section.querySelector('.signin-send');
    const verify = section.querySelector('.signin-verify');
    const codePart = section.querySelector('.signin-code-part');
    const sent = section.querySelector('.signin-sent');
    const feedback = section.querySelector('.signin-feedback');
    emailInput.value = email;

    function busy(button, label) {
      const idle = button.textContent;
      button.disabled = true; button.textContent = label;
      return () => { button.disabled = false; button.textContent = idle; };
    }
    async function requestCode() {
      if (send.disabled) return;
      feedback.textContent = '';
      emailInput.value = emailInput.value.trim();
      if (!emailInput.checkValidity()) { emailInput.reportValidity(); return; }
      const done = busy(send, 'Sending…');
      try {
        const result = await call('requestCode', emailInput.value);
        if (!result.ok) { feedback.textContent = (result.errors || [offline]).join(' '); return; }
        // Deliberately vague: the same words whether or not this email is a member.
        const lines = [
          `If ${emailInput.value} is registered with TPW, we’ve sent it a 6-digit code. It works for ${result.minutes || 10} minutes.`,
          'Have you spelled your email correctly?',
          `Nothing after a few minutes? Check your spam folder, or ${result.contact ? `email TPW at ${result.contact}` : 'contact TPW'}.`
        ];
        sent.replaceChildren(...lines.map(text => Object.assign(document.createElement('p'), { textContent: text })));
        send.hidden = true;
        emailInput.readOnly = true;
        codePart.hidden = false;
        codeInput.value = '';
        codeInput.focus();
      } catch (error) {
        feedback.textContent = offline;
      } finally {
        done();
      }
    }
    async function checkCode() {
      if (verify.disabled) return; // already checking (typing the 6th digit and pressing Enter both start a check)
      feedback.textContent = '';
      codeInput.value = codeInput.value.replace(/\D/g, '');
      if (codeInput.value.length !== 6) { feedback.textContent = 'The code is 6 digits.'; codeInput.focus(); return; }
      const done = busy(verify, 'Checking…');
      try {
        const result = await call('verifyCode', emailInput.value, codeInput.value);
        if (!result.ok) { feedback.textContent = (result.errors || [offline]).join(' '); codeInput.select(); return; }
        window.tpwSession = { token: result.token, organization: result.organization, email: result.email };
        onSignedIn(result);
      } catch (error) {
        feedback.textContent = offline;
      } finally {
        done();
      }
    }
    send.addEventListener('click', requestCode);
    section.querySelector('.signin-resend').addEventListener('click', requestCode);
    verify.addEventListener('click', checkCode);
    section.querySelector('.signin-change').addEventListener('click', () => {
      codePart.hidden = true; send.hidden = false; emailInput.readOnly = false; feedback.textContent = '';
      emailInput.focus(); emailInput.select();
    });
    // Enter would otherwise submit the whole form (the organization step) instead of this box.
    emailInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); if (!send.hidden) requestCode(); } });
    codeInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); checkCode(); } });
    codeInput.addEventListener('input', () => { if (codeInput.value.replace(/\D/g, '').length === 6) checkCode(); });
    return section;
  }

  // Step 1 shows the signed-in organization, locked, instead of asking for it.
  const organizationStep = document.querySelector('#organization-step');
  const organizationInput = document.querySelector('#organization');
  function showOrganization(result) {
    organizationInput.value = result.organization;
    organizationInput.readOnly = true;
    organizationInput.removeAttribute('list');
    document.querySelector('#organization-question').textContent = 'You’re filing for';
    const help = document.querySelector('#organization-help');
    help.textContent = `Signed in as ${result.email}. Your numbers are filed under this name. `;
    const out = Object.assign(document.createElement('button'), { type: 'button', className: 'signin-out', textContent: 'Not you? Sign out' });
    out.addEventListener('click', () => { window.tpwSession = null; location.reload(); });
    help.append(out);
    document.querySelector('#organization-summary').textContent = result.organization;
    document.querySelector('#edit-organization').hidden = true;
  }

  organizationStep.hidden = true;
  const start = panel({
    heading: 'Sign in to file for your organization',
    intro: 'We’ll email you a 6-digit code. Use the email address TPW has for your organization.',
    onSignedIn(result) {
      showOrganization(result);
      start.remove();
      organizationStep.hidden = false;
      document.querySelector('#organization-question').focus();
    }
  });
  organizationStep.before(start);

  // Called by the form when the server says the pass has run out (2 hours). Signs in again in
  // place, so nothing typed is lost.
  function renew() {
    if (document.querySelector('#program-next .signin-step')) return;
    const feedback = document.querySelector('#program-feedback');
    const again = panel({
      heading: 'Your sign-in has run out',
      intro: 'Get a new code, then submit again. Everything you’ve entered is still here.',
      email: window.tpwSession?.email || '',
      onSignedIn(result) {
        const changed = result.organization !== organizationInput.value;
        showOrganization(result);
        again.remove();
        feedback.textContent = changed
          ? `Signed in again, now for ${result.organization}. Your numbers will be filed under that name. Press Finish and submit.`
          : 'Signed in again. Press Finish and submit.';
        document.querySelector('#finish-form').focus();
      }
    });
    document.querySelector('#program-next .next-actions').before(again);
    again.querySelector('input[type="email"]').focus();
  }
  window.tpwSignIn = { renew };
})();
