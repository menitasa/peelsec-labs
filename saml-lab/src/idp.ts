// Example Corp: the identity provider, a small one like Okta or Entra. Employees sign in here and open their apps; an
// admin sets up each app's SAML single sign-on in Applications. It answers an app's request with a signed SAML response
// that the browser carries back to the app.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { AUTHN_CLASSES, GROUP_FILTERS, IDP_NAME, NAMEID_FORMATS, NAMEID_FROM, NEW_EMAIL, USER, USER_FIELDS, USER_GROUPS, base, changeEmail, emailChanged, idpEntityId, nameIdValue, newApp } from './config.ts';
import type { AppConfig, AuthnClass, Claim, ExtraAcs, NameIdFormat, NameIdFrom, UserField } from './config.ts';
import { fetchText } from './fetchmeta.ts';
import { toPem } from './keys.ts';
import { NS, buildResponse, checkQuerySignature, decodeRedirect, idpMetadata, isoNow, kid, newId, parse, pseudonym, readAuthnRequest, readMetadata, text } from './saml.ts';
import type { Keys } from './saml.ts';
import { state } from './state.ts';
import type { IdpSession, Pending } from './state.ts';
import { copyRow, cut, esc, icon, page } from './ui.ts';
import { xmlHtml } from './xmlview.ts';

const COOKIE = 'idp_sid';
// A name's possessive: Expenses', Example Corp's.
const pos = (n: string): string => n.endsWith('s') ? `${n}'` : `${n}'s`;
type Body = Record<string, string | File | (string | File)[]>;
const str = (b: Body, k: string): string => { const v = b[k]; return typeof v === 'string' ? v.trim() : ''; };
const strs = (b: Body, k: string): string[] => { const v = b[k]; return (Array.isArray(v) ? v : v === undefined ? [] : [v]).filter((x): x is string => typeof x === 'string'); };

// v0.5: each setting's label on three platforms, from each vendor's own docs (checked 2026-10-29). The lab names a setting by what it does in SAML; these say where to find it.
const CALLED: Record<string, [string, string, string]> = {
  acs: ['Single sign-on URL', 'Reply URL (Assertion Consumer Service URL)', 'ACS URL'],
  recipient: ['Recipient URL and Destination URL (clear "Use this for Recipient URL and Destination URL")', 'none: the reply URL', 'none'],
  extraAcs: ['Other Requestable SSO URLs (a URL and an index)', 'more Reply URLs (no index field)', 'none'],
  relay: ['Default RelayState', 'Relay State', 'Start URL'],
  entity: ['Audience URI (SP Entity ID)', 'Identifier (Entity ID)', 'Entity ID'],
  issuer: ['SAML Issuer ID', 'Microsoft Entra Identifier (changed only with "Append application ID to issuer")', 'Entity ID (Identity Provider details; no override)'],
  format: ['Name ID format', 'Choose name identifier format', 'Name ID format'],
  nameIdFrom: ['Application username', 'Name identifier value (its source attribute)', 'Name ID'],
  claims: ['Attribute Statements, Group Attribute Statements', 'Attributes & Claims', 'Attribute mapping (Add mapping)'],
  // v0.8 (E19), each platform's own way to send groups (from each vendor's docs).
  groups: ['Group Attribute Statements', 'Add a group claim', 'Group membership'],
  sign: ['Response, Assertion Signature', 'Signing Option', 'Signed response'],
  encrypt: ['Assertion Encryption', 'Token encryption', 'none'],
  signedReq: ['Signed Requests, with the Signature Certificate', 'Require verification certificates', 'none'],
  force: ['Honor Force Authentication', 'none: always obeyed', 'none'],
  authn: ['Authentication context class', 'none: it reports the method the user really used', 'none'],
};
export const calledIn = (row: keyof typeof CALLED | string): string => {
  const c = CALLED[row];
  return c ? `<span class="called">Called: Okta <b>${esc(c[0])}</b> · Entra ID <b>${esc(c[1])}</b> · Google <b>${esc(c[2])}</b></span>` : '';
};

export function idpApp(keys: Keys): Hono {
  const app = new Hono();
  const session = (c: Context): IdpSession | undefined => state.idpSessions.get(getCookie(c, COOKIE) ?? '');
  const show = (c: Context, title: string, body: string, path?: string, status: 200 | 400 | 401 | 404 = 200) =>
    c.html(page({ site: 'idp', title, body, path }), status);
  const admin = (title: string) => `<span class="pill">${icon('gear')} Admin console</span><h1 style="margin-top:14px">${esc(title)}</h1>`;
  const errorPage = (c: Context, title: string, what: string, fix: string) => show(c, title, `
<section class="card stack error-card">
  <span class="pill" style="background:var(--bad-bg);color:var(--bad)">${icon('x')} Sign-in stopped</span>
  <h1>${esc(title)}</h1>
  <p class="lead" style="max-width:none">${what}</p>
  <p class="muted">${fix}</p>
</section>`, undefined, 400);

  const signIn = (c: Context, pid?: string, error?: string) => {
    const p = pid ? state.idpPending.get(pid) : undefined;
    const target = p ? state.apps.get(p.appId) : undefined;
    return show(c, 'Sign in', `
<div class="signin"><section class="card stack">
  ${target ? `<div class="row"><span class="pill">${icon('receipt')} ${esc(target.name)} wants you to sign in${p?.forced ? ' again' : ''}</span>${p?.requestId ? '<a href="/request" class="small">See the request</a>' : ''}</div>` : ''}
  <div><h1 style="font-size:32px">Sign in to ${IDP_NAME}</h1><p class="muted">Use your work account.</p></div>
  <form method="post" action="/login">
    ${pid ? `<input type="hidden" name="pid" value="${esc(pid)}">` : ''}
    <label class="field"><span>Email</span><input type="text" name="username" autocomplete="off" spellcheck="false"></label>
    <label class="field"><span>Password</span><input type="password" name="password" autocomplete="off"></label>
    ${error ? `<p style="color:var(--bad);font-weight:600">${esc(error)}</p>` : ''}
    <button class="btn wide" type="submit">Sign in ${icon('arrow')}</button>
  </form>
  <div class="note">${icon('flask')}<span>Lab test user: <b>${USER.username}</b>, password <b>${USER.password}</b></span></div>
</section></div>`, '/', error ? 401 : 200);
  };

  // The answer: a SAML response, carried by the browser to the app in a web form (the HTTP POST binding).
  const send = (c: Context, s: IdpSession, p: Pending) => {
    const target = state.apps.get(p.appId);
    if (!target) return errorPage(c, 'This app was removed', 'The application was removed from Applications while you signed in.', 'Start again from the app.');
    const acs = p.acs || target.acsUrl;
    const issued = buildResponse({ keys, app: target, acs, inResponseTo: p.requestId || undefined, authnInstant: s.authnInstant, sessionIndex: s.sessionIndex });
    const where = acs.replace(/^https?:\/\//, '');
    const form = (inner: string) => `<form id="send" method="post" action="${esc(acs)}">
      <input type="hidden" name="SAMLResponse" value="${issued.base64}"><input type="hidden" name="RelayState" value="${esc(p.relayState)}">${inner}</form>`;
    if (target.pause) {
      return show(c, `Sending you to ${target.name}`, `
<section class="card stack">
  <span class="pill">${icon('receipt')} On the way to ${esc(target.name)}</span>
  <h1>Your browser carries this to ${esc(target.name)}</h1>
  <p class="lead" style="max-width:none">A web form, sent to <b>${esc(where)}</b>. Inside it: ${IDP_NAME}'s answer${target.unsigned ? ', unsigned' : ', signed'}${target.encrypt && target.encryptCert ? ` and encrypted for ${esc(target.name)}` : ''}.</p>
  <div class="carried"><b>SAMLResponse</b> = ${cut(issued.base64, 260)}<br><br><b>RelayState</b> = ${esc(p.relayState || '(none)')}</div>
  ${form(`<button class="btn" type="submit">Continue to ${esc(target.name)} ${icon('arrow')}</button>`)}
</section>`);
    }
    return show(c, `Sending you to ${target.name}`, `
<section class="card stack" style="text-align:center;padding:56px 28px">
  <div class="spinner" style="margin:0 auto"></div>
  <h2>Taking you to ${esc(target.name)}…</h2>
  <p class="muted">Your browser is carrying ${IDP_NAME}'s signed answer to <b>${esc(where)}</b>.</p>
  ${form('<noscript><button class="btn" type="submit">Continue</button></noscript>')}
</section>
<script>setTimeout(() => document.getElementById('send').submit(), 700)</script>`);
  };

  app.get('/', c => {
    const s = session(c);
    if (!s) return signIn(c);
    const apps = [...state.apps.values()];
    return show(c, 'My apps', `
<div class="stack">
  <div><span class="pill">${icon('user')} ${USER.displayName}</span><h1 style="margin-top:14px">Good to see you, ${USER.givenName}</h1>
  <p class="lead">Your apps. Open one, and ${IDP_NAME} signs you in: no new password.</p></div>
  ${apps.length ? `<div class="tiles">${apps.map(a => `<a class="tile" href="/start?app=${encodeURIComponent(a.id)}"><span class="mark">${icon('receipt')}</span><b>${esc(a.name)}</b><span class="small">Open ${icon('arrow', 'ic')}</span></a>`).join('')}</div>
  <p class="small">Opening an app from here starts the sign-in at ${IDP_NAME}: the answer goes to the app with no request to match.</p>`
    : `<section class="card stack"><h2>No apps yet</h2><p class="muted">An admin adds them in <a href="/admin/apps">Applications</a>.</p></section>`}
  <div class="row"><a class="btn ghost" href="/admin/apps">${icon('gear')} Applications</a><a class="btn ghost" href="/logout">${icon('out')} Sign out</a></div>
</div>`, '/');
  });

  // An app's request arrives in the address (the HTTP Redirect binding), at Example Corp's sign-in address, or (v0.5)
  // at the app's own one, /sso/<app>, as Okta and Google give each app: then the app is found by its address, not by
  // the request's Issuer.
  const sso = (c: Context, appId?: string) => {
    const raw = new URL(c.req.url).search;
    const param = c.req.query('SAMLRequest') ?? '', relayState = c.req.query('RelayState') ?? '';
    let req;
    try { const xml = decodeRedirect(param); req = readAuthnRequest(xml); state.lastRequest = { at: isoNow(), param, xml, relayState, signature: 'none' }; }
    catch { return errorPage(c, "That's not a SAML request", `${IDP_NAME} couldn't read the SAMLRequest in the address.`, 'Start again from the app.'); }
    const target = appId ? state.apps.get(appId) : [...state.apps.values()].find(a => a.entityId === req.issuer);
    if (!target) {
      return errorPage(c, `This app isn't set up in ${IDP_NAME}`,
        appId ? `There is no application at this sign-in address.`
          : `The request came from <b>${esc(req.issuer)}</b>. No application in ${IDP_NAME} has that identifier, so it doesn't know where to send you, or what to tell the app.`,
        `An admin adds it in <a href="/admin/apps">Applications</a>, with the app's identifier (entity ID) and reply URL.`);
    }
    const fix = `Fix it in <a href="/admin/apps/${encodeURIComponent(target.id)}">${esc(pos(target.name))} settings</a>, or in the app.`;
    // Signed requests (SAML Bindings 3.4.4.1): checked with the app's signing certificate from its settings.
    const sig = checkQuerySignature(raw, target.spSigningCert);
    state.lastRequest!.signature = sig;
    if (target.signedRequests && sig !== 'ok') {
      return errorPage(c, sig === 'none' ? 'This request must be signed' : "The request's signature doesn't match",
        sig === 'none' ? `${IDP_NAME} checks every request from ${esc(target.name)}, and this one carries no signature. Anyone could have written it.`
          : `The signature doesn't match ${esc(pos(target.name))} signing certificate: the request changed on the way, or another key signed it.`, fix);
    }
    // Where to send the answer. Unsigned, the request is only advice: the address must be one the admin set up (SAML
    // Profiles 4.1.4.1). Signed and checked, the address in the request is trusted, as Okta's Signed Requests does.
    const known = [target.acsUrl, ...target.extraAcs.map(x => x.url)];
    let acs = target.acsUrl;
    if (req.acsIndex !== undefined) {
      const hit = target.extraAcs.find(x => x.index === req.acsIndex);
      if (!hit) return errorPage(c, `No reply address number ${req.acsIndex}`, `${esc(target.name)} asks for its reply address number <b>${req.acsIndex}</b>, and ${IDP_NAME} has no address with that number for it.`, fix);
      acs = hit.url;
    } else if (req.acs) {
      if (!known.includes(req.acs) && !(target.signedRequests && sig === 'ok')) {
        return errorPage(c, "The reply URL doesn't match",
          `${esc(target.name)} asks for the answer at <b>${esc(req.acs)}</b>, but ${IDP_NAME} has <b>${esc(known.join(', '))}</b> for it. It only sends answers to the addresses its admin set up.`, fix);
      }
      acs = req.acs;
    }
    const forced = req.forceAuthn && target.honorForceAuthn;
    const p: Pending = { appId: target.id, requestId: req.id, relayState, acs, forced };
    const s = session(c);
    if (s && !forced) return send(c, s, p);
    const pid = newId();
    state.idpPending.set(pid, p);
    return signIn(c, pid);
  };
  app.get('/sso', c => sso(c));
  app.get('/sso/:app', c => sso(c, c.req.param('app')));

  // Sign-in started at Example Corp (IdP-initiated): no request from the app to answer.
  app.get('/start', c => {
    const target = state.apps.get(c.req.query('app') ?? '');
    if (!target) return errorPage(c, 'No such app', `${IDP_NAME} has no application by that name.`, 'Open one from My apps.');
    // Where John lands after it: the app's default RelayState, if its admin set one (its meaning is up to the app).
    const p: Pending = { appId: target.id, requestId: '', relayState: target.defaultRelayState };
    const s = session(c);
    if (s) return send(c, s, p);
    const pid = newId();
    state.idpPending.set(pid, p);
    return signIn(c, pid);
  });

  app.post('/login', async c => {
    const body = await c.req.parseBody();
    const pid = typeof body.pid === 'string' ? body.pid : '';
    if (body.username !== USER.username || body.password !== USER.password) return signIn(c, pid || undefined, "That email and password don't match.");
    const sid = newId();
    const s: IdpSession = { user: USER.username, authnInstant: isoNow(), sessionIndex: newId() };
    state.idpSessions.set(sid, s);
    setCookie(c, COOKIE, sid, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
    const p = state.idpPending.get(pid);
    if (p) { state.idpPending.delete(pid); return send(c, s, p); }
    return c.redirect('/', 303);
  });

  app.get('/logout', c => {
    state.idpSessions.delete(getCookie(c, COOKIE) ?? '');
    deleteCookie(c, COOKIE, { path: '/' });
    return c.redirect('/', 303);
  });

  // ---------- the admin console: Applications ----------

  app.get('/admin', c => c.redirect('/admin/apps', 303));
  app.get('/admin/apps', c => {
    const apps = [...state.apps.values()];
    return show(c, 'Applications', `
<div class="stack">
  <div>${admin('Applications')}<p class="lead">The apps your people sign in to with ${IDP_NAME}, and how each one's SAML single sign-on is set up.</p></div>
  ${c.req.query('removed') ? `<div class="flash">${icon('check')} Removed.</div>` : ''}
  <div><a class="btn" href="/admin/apps/new">${icon('plus')} Add a SAML application</a></div>
  <section class="card">${apps.length ? `<table class="apps"><tr><th>Name</th><th>The app's name (entity ID)</th><th>Reply address</th><th></th></tr>
    ${apps.map(a => `<tr><td><b>${esc(a.name)}</b></td><td class="mono">${esc(a.entityId)}</td><td class="mono">${esc(a.acsUrl)}</td>
      <td><a class="btn ghost small" href="/admin/apps/${encodeURIComponent(a.id)}">Open</a></td></tr>`).join('')}</table>`
    : `<h2>No applications yet</h2><p class="muted">Add one with the app's metadata, or its identifier and reply URL.</p>`}</section>
</div>`, '/admin/apps');
  });

  const newForm = (c: Context, error?: string, b: Body = {}) => show(c, 'Add an application', `
<div class="stack">
  <div>${admin('Add a SAML application')}<p class="lead">Start from the app's metadata, or type its details. The app shows both on its single sign-on settings.</p></div>
  ${error ? `<div class="result bad">${icon('x')}<div>Not added<small>${esc(error)}</small></div></div>` : ''}
  <form class="card stack" method="post" action="/admin/apps/new">
    <label class="field"><span>Name</span><input type="text" name="name" value="${esc(str(b, 'name'))}" placeholder="Expenses"></label>
    <div class="section"><h2 style="font-size:20px">From the app's metadata</h2>
      <label class="field"><span>Metadata URL</span><input type="url" name="metaUrl" value="${esc(str(b, 'metaUrl'))}" placeholder="https://app.localhost/metadata.xml"></label>
      <label class="field"><span>Or paste the metadata XML</span><textarea name="metaXml" spellcheck="false">${esc(str(b, 'metaXml'))}</textarea></label></div>
    <div class="or">or type them in</div>
    <label class="field"><span>Identifier (entity ID)</span><input type="text" name="entityId" value="${esc(str(b, 'entityId'))}" spellcheck="false"></label>
    <label class="field"><span>Reply URL (Assertion Consumer Service URL)</span><input type="text" name="acsUrl" value="${esc(str(b, 'acsUrl'))}" spellcheck="false"></label>
    <div><button class="btn" type="submit">${icon('plus')} Add application</button></div>
  </form>
</div>`, '/admin/apps');

  app.get('/admin/apps/new', c => newForm(c));
  app.post('/admin/apps/new', async c => {
    const b = await c.req.parseBody() as Body;
    let entityId = str(b, 'entityId'), acs = str(b, 'acsUrl'), encryptCert = '', signingCert = '';
    let extraAcs: ExtraAcs[] = [];
    const metaUrl = str(b, 'metaUrl'), metaXml = str(b, 'metaXml');
    if (metaUrl || metaXml) {
      try {
        const md = readMetadata(metaUrl ? await fetchText(metaUrl, keys.ca) : metaXml);
        if (!md.sp) throw new Error("This metadata has no service provider part (SPSSODescriptor): it isn't an app's metadata.");
        entityId = md.entityId; acs = md.sp.acsUrl; encryptCert = md.sp.encryptCert; signingCert = md.sp.signingCert; extraAcs = md.sp.extraAcs;
      } catch (e) { return newForm(c, `The metadata didn't work: ${(e as Error).message}`, b); }
    }
    if (!entityId || !acs) return newForm(c, 'It needs an identifier (entity ID) and a reply URL, from the metadata or typed in.', b);
    if ([...state.apps.values()].some(a => a.entityId === entityId)) return newForm(c, `An application with the identifier ${entityId} is already there.`, b);
    const name = str(b, 'name') || new URL(acs, 'https://x').hostname.split('.')[0];
    let id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app';
    while (state.apps.has(id)) id += '-2';
    state.apps.set(id, { ...newApp({ id, name, entityId, acsUrl: acs, encryptCert: encryptCert ? toPem(encryptCert) : '' }),
      spSigningCert: signingCert ? toPem(signingCert) : '', extraAcs });
    return c.redirect(`/admin/apps/${encodeURIComponent(id)}?added=1`, 303);
  });

  const seg = (name: string, value: string, options: [string, string][]) =>
    `<div class="seg" role="radiogroup">${options.map(([v, l]) =>
      `<label><input type="radio" name="${name}" value="${v}"${v === value ? ' checked' : ''}><span>${l}</span></label>`).join('')}</div>`;
  const toggle = (name: string, on: boolean, label: string) =>
    `<label class="switch"><input type="checkbox" name="${name}" value="1"${on ? ' checked' : ''}><span class="track"></span><span>${label}</span></label>`;

  app.get('/admin/apps/:id', c => {
    const a = state.apps.get(c.req.param('id'));
    if (!a) return show(c, 'Not found', `<section class="card"><h1>No such application</h1><p><a href="/admin/apps">Back to Applications</a></p></section>`, '/admin/apps', 404);
    const flash = c.req.query('added') ? `Added. Now give ${a.name} the details in step 6, then turn on single sign-on there.`
      : c.req.query('saved') ? 'Saved. The next sign-in uses these settings.' : '';
    const nameNow: Record<NameIdFormat, string> = { unspecified: nameIdValue(a.nameIdFrom), email: nameIdValue(a.nameIdFrom), persistent: pseudonym(keys.secret, a.entityId), transient: 'a new one at every sign-in' };
    const claimOf = (f: UserField) => a.claims.find(x => x.field === f);
    return show(c, a.name, `
<div class="stack">
  <div>${admin(a.name)}<p class="lead">Single sign-on with SAML: how ${IDP_NAME} answers ${esc(a.name)}.</p></div>
  ${flash ? `<div class="flash">${icon('check')} ${esc(flash)}</div>` : ''}
  ${c.req.query('nogroup') ? `<div class="result bad">${icon('x')}<div>Group attribute left off<small>It needs a name and a filter value (step 3).</small></div></div>` : ''}
  ${c.req.query('nocert') ? `<div class="result bad">${icon('x')}<div>Not saved in full<small>Encryption needs ${esc(pos(a.name))} encryption certificate, and signed requests its signing certificate (step 4).</small></div></div>` : ''}
  <p class="hint">v0.5: each setting under what it does in SAML, then what Okta, Entra ID and Google Workspace call it.</p>
  <form class="stack" method="post" action="/admin/apps/${encodeURIComponent(a.id)}">
    <section class="card section"><h2><span class="num">1</span> Where the answer goes</h2>
      <p class="hint">The app's reply address: where ${IDP_NAME} sends its signed answer, through the browser. It comes from the app.</p>
      <label class="field"><span>Reply address (Assertion Consumer Service URL)</span><input type="text" name="acsUrl" value="${esc(a.acsUrl)}" spellcheck="false">${calledIn('acs')}</label>
      <fieldset>${toggle('sameRecipient', a.sameRecipient, 'The same address for Recipient (inside the assertion) and Destination (on the answer)')}${calledIn('recipient')}</fieldset>
      <label class="field"><span>Recipient, if not the same</span><input type="text" name="recipientUrl" value="${esc(a.recipientUrl)}" spellcheck="false"></label>
      <label class="field"><span>Destination, if not the same</span><input type="text" name="destinationUrl" value="${esc(a.destinationUrl)}" spellcheck="false"></label>
      <label class="field"><span>More reply addresses, one per line: a number, a space, the address</span><textarea name="extraAcs" spellcheck="false" placeholder="1 https://app.localhost/acs/2">${esc(a.extraAcs.map(x => `${x.index} ${x.url}`).join('\n'))}</textarea>
        <span class="small">An app's request may ask for one by its number (AssertionConsumerServiceIndex).</span>${calledIn('extraAcs')}</label>
      <label class="field"><span>Default RelayState: where John lands after a sign-in started here</span><input type="text" name="defaultRelayState" value="${esc(a.defaultRelayState)}" spellcheck="false" placeholder="/reports">
        <span class="small">Sent only when the sign-in starts at ${IDP_NAME} (My apps). What it means is up to the app.</span>${calledIn('relay')}</label></section>
    <section class="card section"><h2><span class="num">2</span> Who is who</h2>
      <p class="hint">The two names. The app's name goes into every answer as its Audience: the app turns away an answer meant for another name.</p>
      <label class="field"><span>The app's name (entity ID): the Audience</span><input type="text" name="entityId" value="${esc(a.entityId)}" spellcheck="false">${calledIn('entity')}</label>
      <label class="field"><span>${IDP_NAME}'s own name (the Issuer), if not the default</span><input type="text" name="issuer" value="${esc(a.issuer)}" spellcheck="false" placeholder="${esc(idpEntityId())}">
        <span class="small">The app checks it against the name it saved. Leave empty for ${esc(idpEntityId())}.</span>${calledIn('issuer')}</label></section>
    <section class="card section"><h2><span class="num">3</span> Who the user is</h2>
      <fieldset><legend>Name ID: which of the user's fields it is</legend><p class="hint">The app finds the user's account by this one value.</p>
        ${seg('nameIdFrom', a.nameIdFrom, NAMEID_FROM.map(([k, l]) => [k, l] as [string, string]))}${calledIn('nameIdFrom')}</fieldset>
      <fieldset><legend>Name ID format: the label sent with it</legend><p class="hint">The name the app gets for John now: <span class="mono">${esc(nameNow[a.format])}</span></p>
        ${seg('format', a.format, [['unspecified', 'Unspecified'], ['email', 'Email address'], ['persistent', 'Persistent'], ['transient', 'Transient']])}
        <span class="small">Persistent and Transient always send a made-up name, whatever field is picked above: random and made for this app (persistent, SAML Core 8.3.7), or new at every sign-in (transient). Unspecified and Email address send the field as it is.</span>${calledIn('format')}</fieldset>
      <p class="hint">Attributes: facts about the user, sent in an attribute statement. Microsoft's products and JWTs call them claims.</p>
      <table class="claims"><tr><th>Send</th><th>From the user's</th><th>As the attribute named</th></tr>
        ${USER_FIELDS.map(f => `<tr><td><label class="check"><input type="checkbox" name="send" value="${f.key}"${claimOf(f.key) ? ' checked' : ''}></label></td>
          <td>${f.label} <span class="small">(${esc(USER[f.key])})</span></td><td><input type="text" name="claim_${f.key}" value="${esc(claimOf(f.key)?.name ?? f.key)}" spellcheck="false"></td></tr>`).join('')}
      </table>${calledIn('claims')}
      <fieldset style="margin:20px 0 0"><legend>Groups: one attribute, one value per group that passes the filter</legend>
        <p class="hint">John's groups: <span class="mono">${esc(USER_GROUPS.join(', '))}</span></p>
        <div style="margin-bottom:14px">${toggle('groupOn', a.groupOn, 'Send a group attribute')}</div>
        <label class="field"><span>As the attribute named</span><input type="text" name="groupName" value="${esc(a.groupName)}" spellcheck="false"></label>
        <div class="field"><span>Send only the groups whose name</span><div>${seg('groupFilter', a.groupFilter, GROUP_FILTERS)}</div></div>
        <label class="field" style="margin-bottom:0"><span>The filter's value</span><input type="text" name="groupValue" value="${esc(a.groupValue)}" spellcheck="false">${calledIn('groups')}</label></fieldset></section>
    <section class="card section"><h2><span class="num">4</span> How it's protected</h2>
      <fieldset><legend>What ${IDP_NAME} signs</legend>${seg('sign', a.sign, [['assertion', 'The assertion'], ['response', 'The whole response'], ['both', 'Both']])}${calledIn('sign')}</fieldset>
      <fieldset><legend>Encryption</legend>${toggle('encrypt', a.encrypt, `Encrypt the assertion for ${esc(a.name)}: only its private key opens it`)}${calledIn('encrypt')}</fieldset>
      <label class="field"><span>${esc(pos(a.name))} encryption certificate</span><textarea name="encryptCert" spellcheck="false" placeholder="-----BEGIN CERTIFICATE-----">${esc(a.encryptCert)}</textarea>
        <span class="small">From its metadata. Needed only to encrypt.</span></label>
      <fieldset><legend>The app's requests</legend>${toggle('signedRequests', a.signedRequests, `Check every request's signature with ${esc(pos(a.name))} signing certificate. Then the reply address may come from the request.`)}${calledIn('signedReq')}</fieldset>
      <label class="field"><span>${esc(pos(a.name))} signing certificate</span><textarea name="spSigningCert" spellcheck="false" placeholder="-----BEGIN CERTIFICATE-----">${esc(a.spSigningCert)}</textarea></label></section>
    <section class="card section"><h2><span class="num">5</span> The sign-in</h2>
      <fieldset>${toggle('honorForceAuthn', a.honorForceAuthn, `When ${esc(a.name)} asks for a fresh sign-in (ForceAuthn), ask John for his password again`)}${calledIn('force')}</fieldset>
      <fieldset><legend>Authentication context class: how the answer says John signed in</legend>
        ${seg('authnClass', a.authnClass, (Object.keys(AUTHN_CLASSES) as AuthnClass[]).map(k => [k, k] as [string, string]))}
        <span class="small">Written into every answer for ${esc(a.name)}, whatever John really did. Some apps read it (Salesforce asks for an email code unless it shows MFA).</span>${calledIn('authn')}</fieldset></section>
    <section class="card section"><h2><span class="num">6</span> Set up ${esc(a.name)} with ${IDP_NAME}</h2>
      <p class="hint">Give these to ${esc(a.name)}, in its single sign-on settings. Or just its metadata URL: the rest is in it.</p>
      ${copyRow('idp-entity', 'Identifier (entity ID)', a.issuer || idpEntityId())}${copyRow('idp-sso', 'Login URL', `${base('idp')}/sso/${encodeURIComponent(a.id)}`)}${copyRow('idp-meta', 'Metadata URL', `${base('idp')}/metadata.xml`)}
      <div class="row" style="margin-top:8px"><a class="btn ghost small" href="/certificate.crt">${icon('download')} Download the signing certificate</a></div></section>
    <section class="card section"><h2><span class="num">7</span> Lab options <span class="pill" style="font-size:14px">test only</span></h2>
      <p class="hint">A real identity provider doesn't offer these. They show what the app does with a bad answer.</p>
      <fieldset><legend>Time to use it</legend>${seg('validFor', String(a.validFor), [['600', '10 minutes'], ['60', '1 minute'], ['10', '10 seconds']])}</fieldset>
      <fieldset>${toggle('unsigned', a.unsigned, `Send it unsigned: ${esc(a.name)} should refuse it`)}</fieldset>
      <fieldset style="margin-bottom:0">${toggle('pause', a.pause, `Stop on the form on the way, to show what the browser carries to ${esc(a.name)}`)}</fieldset></section>
    <div class="row"><button class="btn" type="submit">${icon('check')} Save</button></div>
  </form>
  <form method="post" action="/admin/apps/${encodeURIComponent(a.id)}/delete"><button class="btn ghost" type="submit">${icon('x')} Remove this application</button></form>
</div>`, '/admin/apps');
  });

  app.post('/admin/apps/:id', async c => {
    const a = state.apps.get(c.req.param('id'));
    if (!a) return c.redirect('/admin/apps', 303);
    const b = await c.req.parseBody({ all: true }) as Body;
    const send = strs(b, 'send');
    const claims: Claim[] = USER_FIELDS.filter(f => send.includes(f.key)).map(f => ({ field: f.key, name: str(b, `claim_${f.key}`) || f.key }));
    const cert = toPem(str(b, 'encryptCert')), spCert = toPem(str(b, 'spSigningCert'));
    const wantsEncrypt = str(b, 'encrypt') === '1', wantsSigned = str(b, 'signedRequests') === '1';
    const groupName = str(b, 'groupName'), groupValue = str(b, 'groupValue'), wantsGroup = str(b, 'groupOn') === '1';
    const extraAcs: ExtraAcs[] = str(b, 'extraAcs').split('\n').map(l => l.trim().split(/\s+/)).filter(x => x.length === 2 && /^\d+$/.test(x[0]))
      .map(([n, url]) => ({ index: Number(n), url }));
    const next: Partial<AppConfig> = {
      entityId: str(b, 'entityId') || a.entityId, acsUrl: str(b, 'acsUrl') || a.acsUrl,
      sameRecipient: str(b, 'sameRecipient') === '1', recipientUrl: str(b, 'recipientUrl'), destinationUrl: str(b, 'destinationUrl'),
      extraAcs, defaultRelayState: str(b, 'defaultRelayState'), issuer: str(b, 'issuer'),
      spSigningCert: spCert, signedRequests: wantsSigned && !!spCert, honorForceAuthn: str(b, 'honorForceAuthn') === '1',
      authnClass: (Object.keys(AUTHN_CLASSES) as AuthnClass[]).find(k => k === str(b, 'authnClass')) ?? 'PasswordProtectedTransport',
      format: (Object.keys(NAMEID_FORMATS) as NameIdFormat[]).find(f => f === str(b, 'format')) ?? 'email',
      nameIdFrom: NAMEID_FROM.map(x => x[0]).find((f): f is NameIdFrom => f === str(b, 'nameIdFrom')) ?? 'email',
      groupOn: wantsGroup && !!groupName && !!groupValue, groupName, groupValue,
      groupFilter: GROUP_FILTERS.map(x => x[0]).find(f => f === str(b, 'groupFilter')) ?? 'starts',
      claims, sign: (['assertion', 'response', 'both'] as const).find(v => v === str(b, 'sign')) ?? 'assertion',
      encryptCert: cert, encrypt: wantsEncrypt && !!cert,
      validFor: [600, 60, 10].includes(Number(str(b, 'validFor'))) ? Number(str(b, 'validFor')) : 600,
      unsigned: str(b, 'unsigned') === '1', pause: str(b, 'pause') === '1',
    };
    Object.assign(a, next);
    return c.redirect(`/admin/apps/${encodeURIComponent(a.id)}?${(wantsEncrypt && !cert) || (wantsSigned && !spCert) ? 'nocert=1' : wantsGroup && !a.groupOn ? 'nogroup=1' : 'saved=1'}`, 303);
  });

  app.post('/admin/apps/:id/delete', c => { state.apps.delete(c.req.param('id')); return c.redirect('/admin/apps?removed=1', 303); });

  // ---------- v0.6 (E14): Users, John's profile, and a changed email ----------

  app.get('/admin/users', c => show(c, 'Users', `
<div class="stack">
  <div>${admin('Users')}<p class="lead">Example Corp's directory. Each app gets one of these fields as the user's Name ID, set in its Applications page.</p></div>
  ${c.req.query('changed') ? `<div class="flash">${icon('check')} Saved. John's email is now ${esc(USER.email)}, and he signs in with it.</div>` : ''}
  <section class="card"><dl class="facts">
    <dt>Name</dt><dd>${esc(USER.displayName)}</dd>
    <dt>Sign-in name</dt><dd><code>${esc(USER.username)}</code><br><span class="small">Follows the email.</span></dd>
    <dt>Email</dt><dd><code>${esc(USER.email)}</code></dd>
    <dt>Employee ID</dt><dd><code>${esc(USER.employeeId)}</code></dd>
    <dt>User ID</dt><dd><code>${esc(USER.userId)}</code><br><span class="small">Made by ${IDP_NAME}. Nobody types it, and it never changes.</span></dd>
    <dt>Groups</dt><dd>${USER_GROUPS.map(g => `<code>${esc(g)}</code>`).join(', ')}</dd>
  </dl></section>
  <form method="post" action="/admin/users/email"><button class="btn" type="submit">${icon('gear')} ${emailChanged() ? `Change John's email back` : `Change John's email to ${esc(NEW_EMAIL)}`}</button></form>
</div>`, '/admin/users'));
  app.post('/admin/users/email', c => { changeEmail(); return c.redirect('/admin/users?changed=1', 303); });

  // ---------- the last request, decoded ----------

  app.get('/request', c => {
    const r = state.lastRequest;
    if (!r) return show(c, 'Last request', `<section class="card stack"><h1>No request yet</h1><p class="lead">Start at an app and click "Sign in". The request it sends shows up here.</p></section>`, '/request');
    const root = parse(r.xml);
    const issuer = text(kid(root, NS.saml, 'Issuer'));
    const from = [...state.apps.values()].find(a => a.entityId === issuer)?.name ?? 'the app';
    return show(c, 'Last request', `
<div class="stack">
  <div><span class="pill">${icon('doc')} Last request</span><h1 style="margin-top:14px">What ${esc(from)} asked ${IDP_NAME}</h1>
  <p class="lead">It came in the address, as <span class="mono">?SAMLRequest=</span>: compressed with deflate, then written in base64 so it fits in a web address.</p></div>
  <div class="carried"><b>SAMLRequest</b> = ${cut(r.param, 220)}<br><br><b>RelayState</b> = ${esc(r.relayState || '(none)')}</div>
  <h2>Decoded</h2>
  ${xmlHtml(r.xml, { parts: 'request' })}
  <section class="card"><dl class="facts">
    <dt>Who asks</dt><dd>${esc(issuer)}</dd>
    <dt>Where to send the answer</dt><dd>${root.getAttribute('AssertionConsumerServiceIndex') ? `Reply address number ${esc(root.getAttribute('AssertionConsumerServiceIndex'))}` : esc(root.getAttribute('AssertionConsumerServiceURL'))}</dd>
    <dt>Sign in again?</dt><dd>${root.getAttribute('ForceAuthn') === 'true' ? 'Yes: ForceAuthn="true", sign John in again even if he already did' : 'No'}</dd>
    <dt>Signed?</dt><dd>${r.signature === 'ok' ? 'Yes, and the signature matches the app\'s signing certificate' : r.signature === 'bad' ? 'Signed, but the signature does not match' : 'No'}</dd>
    <dt>The request's number</dt><dd><code>${esc(root.getAttribute('ID'))}</code><br><span class="small">The answer quotes it, so the app knows it answers this request.</span></dd>
    <dt>Sent at</dt><dd>${esc(root.getAttribute('IssueInstant'))}</dd>
  </dl></section>
</div>`, '/request');
  });

  // ---------- metadata and the certificate ----------

  app.get('/metadata.xml', c => c.body(idpMetadata(keys), 200, { 'content-type': 'application/samlmetadata+xml; charset=utf-8' }));
  app.get('/certificate.crt', c => c.body(keys.idpCert, 200, { 'content-type': 'application/x-pem-file', 'content-disposition': 'attachment; filename="example-corp-signing.crt"' }));
  app.get('/metadata', c => show(c, 'Metadata', `
<div class="stack">
  <div><span class="pill">${icon('doc')} Metadata</span><h1 style="margin-top:14px">What ${IDP_NAME} tells its apps</h1>
  <p class="lead">Its name (the entity ID), where to send users to sign in, and the certificate that checks its signatures.</p></div>
  ${copyRow('meta-url', 'Metadata URL', `${base('idp')}/metadata.xml`)}
  ${xmlHtml(idpMetadata(keys))}
</div>`, '/metadata'));

  return app;
}
