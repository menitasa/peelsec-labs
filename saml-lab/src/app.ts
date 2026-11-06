// Expenses: the service provider, an app Example Corp's people use for expense reports. Its admin sets up single
// sign-on in its settings: which identity provider it trusts, and how to reach it. Then it sends John there with a
// request, takes the answer at /acs, runs its checks, and shows what arrived.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { APP_ACCOUNT, APP_NAME, NAMEID_FORMATS, acsUrl, acsUrl2, appEntityId, base } from './config.ts';
import type { RequireSigned, UnknownName } from './config.ts';
import { fetchText } from './fetchmeta.ts';
import { toPem } from './keys.ts';
import { authnRequest, encodeRedirect, newId, readMetadata, receive, signedQuery, spMetadata } from './saml.ts';
import type { Keys, Login } from './saml.ts';
import { state } from './state.ts';
import { checksList, copyRow, cut, esc, icon, page } from './ui.ts';
import { xmlHtml } from './xmlview.ts';

const COOKIE = 'app_sid', LINK_COOKIE = 'app_link';
const FORMAT_NAMES: Record<string, string> = {
  'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified': 'unspecified: no promise about what it is',
  'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress': 'email address',
  'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent': 'persistent: the same made-up name every time',
  'urn:oasis:names:tc:SAML:2.0:nameid-format:transient': 'transient: a new name for this sign-in only',
};
const REPORTS: [string, string, string, 'ok' | 'wait' | 'draft'][] = [
  ['Taxi to the airport', '14 Oct', '€42', 'ok'], ['Hotel, 2 nights', '15 Oct', '€310', 'wait'], ['Team lunch', '17 Oct', '€86', 'draft'],
];
const STATUS = { ok: ['Approved', 'var(--ok)', 'var(--ok-bg)'], wait: ['Waiting for approval', '#B45309', '#FEF3C7'], draft: ['Draft', 'var(--label)', 'var(--skip-bg)'] } as const;
// v0.8 (E19): one report from John's team, a sample colleague's: not his own, since nobody should approve their own report.
const TEAM_REPORT = { who: 'Jane Roe', what: 'Client dinner', date: '20 Oct', amount: '€128' };
type Body = Record<string, string | File | (string | File)[]>;
const str = (b: Body, k: string): string => { const v = b[k]; return typeof v === 'string' ? v.trim() : ''; };

export function expensesApp(keys: Keys): Hono {
  const app = new Hono();
  const session = (c: Context) => state.appSessions.get(getCookie(c, COOKIE) ?? '');
  const show = (c: Context, title: string, body: string, path?: string) => c.html(page({ site: 'app', title, body, path }));
  const firstName = (l: Login) => l.attributes.find(a => /^(givenName|firstName|given_name)$/i.test(a.name))?.values[0];
  const idpName = () => state.sp.idpName || 'your identity provider';
  const seg = (name: string, value: string, options: [string, string][]) =>
    `<div class="seg" role="radiogroup">${options.map(([v, l]) => `<label><input type="radio" name="${name}" value="${v}"${v === value ? ' checked' : ''}><span>${l}</span></label>`).join('')}</div>`;
  const UNKNOWN: [UnknownName, string][] = [['link', 'Ask them to sign in once with their ' + APP_NAME + ' password, and link it'], ['create', 'Make a new, empty account'], ['refuse', 'Refuse: no account for this name']];
  // v0.7 (E15): what Expenses requires to be signed.
  const REQUIRE: [RequireSigned, string][] = [['either', 'Either one'], ['response', 'The whole response'], ['assertion', 'The assertion'], ['both', 'Both']];
  const wantsAssertions = () => state.sp.requireSigned === 'assertion' || state.sp.requireSigned === 'both';
  const idpLabel = (entity: string) => entity === state.sp.entityId ? idpName() : entity;
  const sw = (name: string, on: boolean, label: string) =>
    `<label class="switch" style="margin-bottom:10px"><input type="checkbox" name="${name}" value="1"${on ? ' checked' : ''}><span class="track"></span><span>${label}</span></label>`;

  // v0.8 (E19): Expenses' own rule, read only from the answer that signed John in: the name and the value both exact,
  // capitals included. The team's card shows only with the rule on, so a reset's home page has no new card. The button
  // does nothing in this version: the demo only sees it appear.
  const mayApprove = (l: Login) => l.attributes.some(a => a.name === state.sp.approversAttr && a.values.includes(state.sp.approversValue));
  const teamReports = (l: Login) => !state.sp.approvers ? '' : `<div style="margin-top:24px"><section class="card"><h2>Reports from your team</h2><table class="apps"><tr><th>Who</th><th>What</th><th>Date</th><th>Amount</th><th>Status</th><th></th></tr>
    <tr><td><b>${TEAM_REPORT.who}</b></td><td>${TEAM_REPORT.what}</td><td>${TEAM_REPORT.date}</td><td>${TEAM_REPORT.amount}</td>
      <td><span class="pill" style="color:${STATUS.wait[1]};background:${STATUS.wait[2]}">${STATUS.wait[0]}</span></td>
      <td>${mayApprove(l) ? `<button class="btn" type="button" id="approve">${icon('check')} Approve</button>` : ''}</td></tr></table></section></div>`;

  const reports = () => `<section class="card"><h2>Your expense reports</h2><table class="apps"><tr><th>What</th><th>Date</th><th>Amount</th><th>Status</th></tr>
    ${REPORTS.map(([what, date, amount, st]) => `<tr><td><b>${what}</b></td><td>${date}</td><td>${amount}</td>
      <td><span class="pill" style="color:${STATUS[st][1]};background:${STATUS[st][2]}">${STATUS[st][0]}</span></td></tr>`).join('')}</table></section>`;

  app.get('/', c => {
    const s = session(c);
    if (!s) {
      const ready = state.sp.on;
      return show(c, 'Sign in', `
<section class="hero">
  ${icon('receipt', 'big-ic')}
  <span class="pill">${icon('shield')} Sign in with your company account</span>
  <h1 style="margin-top:18px">Expense reports, done in minutes</h1>
  <p class="lead">Snap the receipt, send the report, get paid back.</p>
  ${ready ? `<a class="btn" href="/login" style="margin-top:8px">${icon('building')} Sign in with ${esc(idpName())}</a>`
    : `<button class="btn" type="button" disabled style="margin-top:8px;opacity:.45;cursor:not-allowed">${icon('building')} Sign in with SSO</button>`}
</section>
${ready ? '' : `<section class="card stack error-card" style="margin-top:24px"><h2>Single sign-on isn't set up yet</h2>
  <p class="muted">${APP_NAME} doesn't know your company's identity provider yet. An admin sets it up in <a href="/admin/sso">Single sign-on</a>: which identity provider to trust, and how to reach it.</p></section>`}`, '/');
    }
    const acct = s.account ? state.accounts.get(s.account) : undefined;
    const facts = [
      `<dt>Name ID</dt><dd><code>${esc(s.nameId)}</code><br><span class="small">${esc(FORMAT_NAMES[s.format] ?? s.format)}</span></dd>`,
      `<dt>Account</dt><dd>${acct ? `<code>${esc(acct.id)}</code>${acct.made === 'sign-in' ? '<br><span class="small">New: made at this sign-in</span>' : ''}` : '<span class="small">None: a transient name, kept for this session only</span>'}</dd>`,
      ...s.attributes.map(a => `<dt>${esc(a.name)}</dt><dd>${esc(a.values.join(', '))}</dd>`),
      `<dt>Signed in</dt><dd>at ${esc(idpName())}, ${esc(s.authnInstant.slice(11, 19))} UTC</dd>`,
    ].join('');
    return show(c, 'Welcome', `
<section class="hero">
  ${icon('receipt', 'big-ic')}
  <span class="pill">${icon('check')} Signed in with ${esc(idpName())}</span>
  <h1 style="margin-top:18px">Welcome, ${esc(firstName(s) ?? acct?.name ?? s.nameId)}</h1>
  <p class="lead">${s.linked ? `Linked: ${esc(idpName())}${idpName().endsWith('s') ? "'" : "'s"} name for you now opens this account. Next time, no ${APP_NAME} password.` : `You didn't type a password here. ${esc(idpName())} vouched for you.`}</p>
</section>
<section class="card stack" style="margin-top:24px">
  <h2>What ${APP_NAME} knows about you</h2>
  <p class="muted">Only what the answer from ${esc(idpName())} said:</p>
  <dl class="facts">${facts}</dl>
  <div class="row"><a class="btn" href="/arrived">${icon('eye')} See what arrived</a><a class="btn ghost" href="/logout">${icon('out')} Sign out</a></div>
</section>${teamReports(s)}
<div style="margin-top:24px">${acct?.reports ? reports() : `<section class="card stack"><h2>Your expense reports</h2><p class="muted">${acct ? 'None yet. This account is empty.' : 'No account, so nothing is kept after you sign out.'}</p></section>`}</div>`, '/');
  });

  // Off to the identity provider, with a request in the address (the HTTP Redirect binding).
  app.get('/login', c => {
    if (!state.sp.on) return c.redirect('/', 303);
    const id = newId(), sp = state.sp;
    state.appPending.add(id);
    const req = encodeRedirect(authnRequest({ id, destination: sp.ssoUrl, acsIndex: sp.acsBy === 'index' ? sp.acsIndex : undefined, forceAuthn: sp.forceAuthn }));
    const relay = c.req.query('next') ?? '/';
    // v0.5: signed the HTTP Redirect binding's way when its admin turned it on (SAML Bindings 3.4.4.1).
    const query = sp.signRequests ? signedQuery(req, relay, keys.appKey)
      : `SAMLRequest=${encodeURIComponent(req)}&RelayState=${encodeURIComponent(relay)}`;
    return c.redirect(`${sp.ssoUrl}${sp.ssoUrl.includes('?') ? '&' : '?'}${query}`, 302);
  });

  // The identity provider's answer, carried here by the browser (the HTTP POST binding): the assertion consumer service.
  // v0.5: a second reply address, /acs/2 (number 1 in its metadata), the same checks with its own address.
  const acs = async (c: Context, at: string) => {
    const body = await c.req.parseBody();
    const base64 = typeof body.SAMLResponse === 'string' ? body.SAMLResponse : '';
    const relayState = typeof body.RelayState === 'string' ? body.RelayState : '';
    const arrival = receive({ base64, relayState, at, keys, idp: state.sp, pending: state.appPending, used: state.used });
    state.lastArrival = arrival;
    if (!arrival.ok || !arrival.login) return c.redirect('/arrived', 303);
    const login = arrival.login, next = relayState.startsWith('/') && !relayState.startsWith('//') ? relayState : '/';
    // v0.6 (E14): Expenses finds the account by the Name ID, exactly as it came (SAML Core 1.3.1: no case folding).
    if (login.format === NAMEID_FORMATS.transient) return signedIn(c, login, arrival.at, undefined, next);
    const link = state.links.find(l => l.idp === state.sp.entityId && l.nameId === login.nameId);
    if (link) return signedIn(c, login, arrival.at, link.account, next);
    if (state.sp.unknownName === 'create') {
      let n = state.accounts.size + 1;
      while (state.accounts.has(`user${n}`)) n++;
      const id = `user${n}`;
      state.accounts.set(id, { id, name: login.nameId, password: '', reports: false, made: 'sign-in' });
      state.links.push({ idp: state.sp.entityId, nameId: login.nameId, account: id, at: arrival.at.slice(11, 19) + ' UTC' });
      return signedIn(c, login, arrival.at, id, next);
    }
    if (state.sp.unknownName === 'refuse') {
      return c.html(page({ site: 'app', title: 'No account', body: `<section class="card stack error-card"><h1>No account for this name</h1>
        <p class="lead" style="max-width:none">${esc(idpName())} vouched for <code>${esc(login.nameId)}</code>, and ${APP_NAME} has no account with that name.</p>
        <p class="muted">An admin can link it in <a href="/admin/users">Users</a>. <a href="/arrived">See what arrived</a>.</p></section>` }), 403);
    }
    const tid = newId();
    state.toLink.set(tid, { login, at: arrival.at });
    setCookie(c, LINK_COOKIE, tid, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
    return c.redirect('/link', 303);
  };
  const signedIn = (c: Context, login: Login, at: string, account: string | undefined, next: string, linked = false) => {
    const sid = newId();
    state.appSessions.set(sid, { ...login, at, account, linked });
    setCookie(c, COOKIE, sid, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
    return c.redirect(next, 303);
  };

  // v0.6 (E14): a name Expenses doesn't know. The person signs in once with Expenses' own password, and the name is
  // linked to that account (the SAML overview, 5.4.3, steps 7 and 8). After that, the name alone is enough.
  const linkPage = (c: Context, error?: string) => {
    const t = state.toLink.get(getCookie(c, LINK_COOKIE) ?? '');
    if (!t) return c.redirect('/', 303);
    return show(c, 'Link your account', `
<div class="signin"><section class="card stack">
  <span class="pill">${icon('building')} ${esc(idpName())} signed you in</span>
  <div><h1 style="font-size:30px">${APP_NAME} doesn't know this name yet</h1>
  <p class="muted">${esc(idpName())} calls you <code>${esc(t.login.nameId)}</code>. Sign in once with your ${APP_NAME} account, and ${APP_NAME} links the two. Next time, the name is enough.</p></div>
  <form method="post" action="/link">
    <label class="field"><span>${APP_NAME} account</span><input type="text" name="account" autocomplete="off" spellcheck="false"></label>
    <label class="field"><span>${APP_NAME} password</span><input type="password" name="password" autocomplete="off"></label>
    ${error ? `<p style="color:var(--bad);font-weight:600">${esc(error)}</p>` : ''}
    <button class="btn wide" type="submit">Link and sign in ${icon('arrow')}</button>
  </form>
  <div class="note">${icon('flask')}<span>Lab account: <b>${APP_ACCOUNT.id}</b>, password <b>${APP_ACCOUNT.password}</b></span></div>
</section></div>`, '/', );
  };
  app.get('/link', c => linkPage(c));
  app.post('/link', async c => {
    const tid = getCookie(c, LINK_COOKIE) ?? '', t = state.toLink.get(tid);
    if (!t) return c.redirect('/', 303);
    const b = await c.req.parseBody();
    const a = state.accounts.get(typeof b.account === 'string' ? b.account.trim() : '');
    if (!a || !a.password || b.password !== a.password) return linkPage(c, "That account and password don't match.");
    state.links.push({ idp: state.sp.entityId, nameId: t.login.nameId, account: a.id, at: new Date().toISOString().slice(11, 19) + ' UTC' });
    state.toLink.delete(tid);
    deleteCookie(c, LINK_COOKIE, { path: '/' });
    return signedIn(c, t.login, t.at, a.id, '/', true);
  });

  // v0.6 (E14): Users: Expenses' accounts, and which Name ID opens which account.
  app.get('/admin/users', c => {
    const accts = [...state.accounts.values()];
    return show(c, 'Users', `
<div class="stack">
  <div><span class="pill">${icon('gear')} Settings</span><h1 style="margin-top:14px">Users</h1>
  <p class="lead">${APP_NAME}' accounts, and the links: which name from the identity provider opens which account.</p></div>
  <section class="card"><h2>Accounts</h2>${accts.length ? `<table class="apps"><tr><th>Account</th><th>Name</th><th>Expense reports</th><th>Made</th></tr>
    ${accts.map(a => `<tr><td><code>${esc(a.id)}</code></td><td>${esc(a.name)}</td><td>${a.reports ? '3' : 'none'}</td><td>${a.made === 'admin' ? 'by the admin' : 'at a sign-in'}</td></tr>`).join('')}</table>`
    : '<p class="muted">No accounts.</p>'}</section>
  <section class="card"><h2>Links</h2>${state.links.length ? `<table class="apps"><tr><th>Name ID</th><th>From</th><th>Account</th><th>Linked</th></tr>
    ${state.links.map(l => `<tr><td><code>${esc(l.nameId)}</code></td><td>${esc(idpLabel(l.idp))}</td><td><code>${esc(l.account)}</code></td><td>${esc(l.at)}</td></tr>`).join('')}</table>`
    : '<p class="muted">No links yet.</p>'}</section>
  <p class="muted">A name with no link: ${esc(UNKNOWN.find(u => u[0] === state.sp.unknownName)?.[1] ?? '')}. Change it in <a href="/admin/sso">Single sign-on</a>.</p>
</div>`, '/admin/users');
  });
  app.post('/acs', c => acs(c, acsUrl()));
  app.post('/acs/2', c => acs(c, acsUrl2()));

  app.get('/arrived', c => {
    const a = state.lastArrival;
    if (!a) {
      return show(c, 'What arrived', `<section class="card stack"><h1>Nothing arrived yet</h1><p class="lead">Sign in with your identity provider, and the answer it sends shows up here, with every check ${APP_NAME} ran.</p>
        ${state.sp.on ? `<div><a class="btn" href="/login">${icon('building')} Sign in with ${esc(idpName())}</a></div>` : ''}</section>`, '/arrived');
    }
    const failed = a.checks.filter(x => x.ok === false);
    const why = failed.length === 1 ? `${failed[0].label}: ${failed[0].detail}` : `${failed.length} checks failed: ${failed.map(x => x.label).join(' · ')}`;
    return show(c, 'What arrived', `
<div class="stack">
  <div><span class="pill">${icon('eye')} What arrived</span><h1 style="margin-top:14px">What ${esc(idpName())} sent to ${APP_NAME}</h1>
  <p class="lead">Arrived at ${esc(a.at.slice(11, 19))} UTC, in a web form your browser sent to ${APP_NAME}.</p></div>
  <div class="result ${a.ok ? 'ok' : 'bad'}">${icon(a.ok ? 'check' : 'x')}<div>${a.ok ? 'Accepted: John is signed in' : 'Turned away'}
    <small>${a.ok ? 'Every check below passed.' : esc(why)}</small></div></div>

  <h2>What your browser carried</h2>
  <div class="carried"><b>SAMLResponse</b> = ${cut(a.base64, 260)}<br><br><b>RelayState</b> = ${esc(a.relayState || '(none)')}</div>
  <p class="caption">Base64 is another way to write the same bytes, so they fit in a web form. It hides nothing: decoded, it's the XML below.</p>

  ${a.encryptedXml ? `<h2>Encrypted for ${APP_NAME}</h2>
  ${xmlHtml(a.encryptedXml)}
  <div class="flash" style="background:#EEF2FF;color:#3730A3">${icon('key')} Opened with ${APP_NAME}' private key. The browser carried it, but couldn't read it.</div>` : ''}

  ${a.assertionXml ? `<h2>The assertion</h2>${xmlHtml(a.assertionXml, { parts: 'assertion' })}
  <p class="caption"><span style="color:#B45309">…</span> marks a long value cut short on screen.</p>` : ''}

  <h2>${APP_NAME}' checks</h2>
  <section class="card">${checksList(a.checks)}</section>

  <div class="row">
    <form method="post" action="${esc(new URL(a.acs || acsUrl()).pathname)}"><input type="hidden" name="SAMLResponse" value="${esc(a.base64)}"><input type="hidden" name="RelayState" value="${esc(a.relayState)}">
      <button class="btn ghost" type="submit">${icon('again')} Send the same response again</button></form>
    <a class="btn ghost" href="/">${icon('receipt')} Back to ${APP_NAME}</a>
  </div>
  <details class="card flat"><summary style="cursor:pointer;font-weight:600">The whole response, as it arrived</summary><div style="margin-top:16px">${xmlHtml(a.responseXml)}</div></details>
</div>`, '/arrived');
  });

  app.get('/logout', c => {
    state.appSessions.delete(getCookie(c, COOKIE) ?? '');
    deleteCookie(c, COOKIE, { path: '/' });
    return c.redirect('/', 303);
  });

  // ---------- Settings: Single sign-on ----------

  const ssoPage = (c: Context, error?: string) => {
    const sp = state.sp;
    const flash = c.req.query('saved') ? (sp.on ? `Saved. Single sign-on is on: people sign in with ${sp.idpName || 'your identity provider'}.` : 'Saved. Single sign-on is off.') : '';
    return show(c, 'Single sign-on', `
<div class="stack">
  <div><span class="pill">${icon('gear')} Settings</span><h1 style="margin-top:14px">Single sign-on (SAML)</h1>
  <p class="lead">Let your people sign in to ${APP_NAME} with your company's identity provider, like Okta or Microsoft Entra ID.</p></div>
  ${flash ? `<div class="flash">${icon('check')} ${esc(flash)}</div>` : ''}
  ${error ? `<div class="result bad">${icon('x')}<div>Not saved<small>${esc(error)}</small></div></div>` : ''}
  <div class="result ${sp.on ? 'ok' : 'bad'}" style="font-size:18px">${icon(sp.on ? 'check' : 'x')}<div>${sp.on ? `On, with ${esc(sp.idpName || sp.entityId)}` : 'Off'}</div></div>
  <section class="card section"><h2><span class="num">1</span> Give these to your identity provider</h2>
    <p class="hint">In its admin console, add ${APP_NAME} as a SAML application with these. Or just the metadata URL: the rest is in it.</p>
    ${copyRow('sp-entity', 'Identifier (entity ID)', appEntityId())}${copyRow('sp-acs', 'Reply URL (ACS URL)', acsUrl())}${copyRow('sp-acs2', 'Reply URL number 1', acsUrl2())}${copyRow('sp-meta', 'Metadata URL', `${base('app')}/metadata.xml`)}
    <div class="row" style="margin-top:8px"><a class="btn ghost small" href="/encryption.crt">${icon('download')} Download the certificate (signing and encryption)</a></div></section>
  <form class="card section" method="post" action="/admin/sso">
    <h2><span class="num">2</span> Your identity provider</h2>
    <p class="hint">From its metadata, or typed in from its setup page.</p>
    <label class="field"><span>Name</span><input type="text" name="idpName" value="${esc(sp.idpName)}" placeholder="Example Corp"></label>
    <label class="field"><span>Metadata URL</span><input type="url" name="metaUrl" placeholder="https://idp.localhost/metadata.xml"></label>
    <label class="field"><span>Or paste the metadata XML</span><textarea name="metaXml" spellcheck="false"></textarea></label>
    <div class="or">or type them in</div>
    <label class="field"><span>Identifier (entity ID)</span><input type="text" name="entityId" value="${esc(sp.entityId)}" spellcheck="false"></label>
    <label class="field"><span>Login URL</span><input type="text" name="ssoUrl" value="${esc(sp.ssoUrl)}" spellcheck="false"></label>
    <label class="field"><span>Signing certificate</span><textarea name="cert" spellcheck="false" placeholder="-----BEGIN CERTIFICATE-----">${esc(sp.cert)}</textarea>
      <span class="small">${APP_NAME} checks every assertion's signature with this certificate, and with nothing else.</span></label>
    <h2 style="font-size:20px;margin-top:18px">${APP_NAME}'s requests and answers</h2>
    ${sw('signRequests', sp.signRequests, `Sign every request with ${APP_NAME}'s key (the identity provider checks it with the certificate above)`)}
    ${sw('forceAuthn', sp.forceAuthn, 'Ask for a fresh sign-in every time (ForceAuthn)')}
    ${sw('acsByIndex', sp.acsBy === 'index', 'Ask for the answer at reply address number 1, by its number, not by its address')}
    ${sw('acceptUnsolicited', sp.acceptUnsolicited, 'Accept answers nobody asked for: a sign-in started at the identity provider')}
    <fieldset style="margin:8px 0"><legend>What must be signed</legend>${seg('requireSigned', sp.requireSigned, REQUIRE)}
      <span class="small">SAML asks that at least one is signed. An app may insist on one: then an answer without it is turned away.</span></fieldset>
    <fieldset style="margin:8px 0"><legend>A name ${APP_NAME} has no account for</legend>${seg('unknownName', sp.unknownName, UNKNOWN)}
      <span class="small">What an app does here is its own choice. ${APP_NAME} finds accounts by the Name ID, exactly as it comes: see <a href="/admin/users">Users</a>.</span></fieldset>
    <fieldset style="margin:8px 0"><legend>Approvers</legend>${sw('approvers', sp.approvers, 'Show the Approve button only to approvers')}
      <label class="field"><span>The attribute ${APP_NAME} looks for</span><input type="text" name="approversAttr" value="${esc(sp.approversAttr)}" spellcheck="false"></label>
      <label class="field" style="margin-bottom:6px"><span>The value that makes someone an approver</span><input type="text" name="approversValue" value="${esc(sp.approversValue)}" spellcheck="false"></label>
      <span class="small">${APP_NAME}' own rule. Both must match exactly.</span></fieldset>
    <fieldset style="margin:8px 0 20px">${sw('on', sp.on, 'Sign in with SSO is on')}</fieldset>
    <div class="row"><button class="btn" type="submit">${icon('check')} Save</button></div>
  </form>
</div>`, '/admin/sso');
  };

  app.get('/admin', c => c.redirect('/admin/sso', 303));
  app.get('/admin/sso', c => ssoPage(c));
  app.post('/admin/sso', async c => {
    const b = await c.req.parseBody() as Body;
    let entityId = str(b, 'entityId'), sso = str(b, 'ssoUrl'), cert = str(b, 'cert');
    const metaUrl = str(b, 'metaUrl'), metaXml = str(b, 'metaXml');
    if (metaUrl || metaXml) {
      try {
        const md = readMetadata(metaUrl ? await fetchText(metaUrl, keys.ca) : metaXml);
        if (!md.idp) throw new Error("This metadata has no identity provider part (IDPSSODescriptor): it isn't an identity provider's metadata.");
        entityId = md.entityId; sso = md.idp.ssoUrl; cert = md.idp.cert;
      } catch (e) { return ssoPage(c, `The metadata didn't work: ${(e as Error).message}`); }
    }
    const on = str(b, 'on') === '1';
    if (on && (!entityId || !sso || !cert)) return ssoPage(c, 'To turn it on, it needs the identifier (entity ID), the login URL and the signing certificate.');
    const approvers = str(b, 'approvers') === '1', approversAttr = str(b, 'approversAttr'), approversValue = str(b, 'approversValue');
    if (approvers && (!approversAttr || !approversValue)) return ssoPage(c, 'The Approvers rule needs the attribute it looks for and the value.');
    if (sso) { try { new URL(sso); } catch { return ssoPage(c, "The login URL isn't a web address."); } }
    state.sp = { on, idpName: str(b, 'idpName'), entityId, ssoUrl: sso, cert: cert ? toPem(cert) : '',
      signRequests: str(b, 'signRequests') === '1', forceAuthn: str(b, 'forceAuthn') === '1',
      acsBy: str(b, 'acsByIndex') === '1' ? 'index' : 'url', acsIndex: 1, acceptUnsolicited: str(b, 'acceptUnsolicited') === '1',
      unknownName: UNKNOWN.map(u => u[0]).find(u => u === str(b, 'unknownName')) ?? 'link',
      requireSigned: REQUIRE.map(r => r[0]).find(r => r === str(b, 'requireSigned')) ?? 'either',
      approvers, approversAttr, approversValue };
    return c.redirect('/admin/sso?saved=1', 303);
  });

  // ---------- metadata and the certificate ----------

  app.get('/metadata.xml', c => c.body(spMetadata(keys, state.sp.signRequests, wantsAssertions()), 200, { 'content-type': 'application/samlmetadata+xml; charset=utf-8' }));
  app.get('/encryption.crt', c => c.body(keys.appCert, 200, { 'content-type': 'application/x-pem-file', 'content-disposition': 'attachment; filename="expenses-encryption.crt"' }));
  app.get('/metadata', c => show(c, 'Metadata', `
<div class="stack">
  <div><span class="pill">${icon('doc')} Metadata</span><h1 style="margin-top:14px">What ${APP_NAME} tells its identity provider</h1>
  <p class="lead">Its name (the entity ID), where to send the answer, and the certificate to encrypt assertions for it.</p></div>
  ${copyRow('meta-url', 'Metadata URL', `${base('app')}/metadata.xml`)}
  ${xmlHtml(spMetadata(keys, state.sp.signRequests, wantsAssertions()))}
</div>`, '/metadata'));

  return app;
}
