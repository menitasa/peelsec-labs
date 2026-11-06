// The PeelSec SAML lab: one small server for three addresses on this Mac.
//   https://localhost      the lab home
//   https://idp.localhost  Example Corp, the identity provider (like Okta or Entra, but ours)
//   https://app.localhost  Expenses, the service provider (an app the company uses)
// Start: npm start (from the lab folder). It listens only on this Mac (127.0.0.1 and ::1), with https on port 443 when
// it can, else 8443 (or PORT=...), and plain http on 80 (or 8080) only to send the browser on to https.
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { getRequestListener } from '@hono/node-server';
import { Hono } from 'hono';
import { APP_NAME, HOSTS, IDP_NAME, USER, base, setPort } from './config.ts';
import { CA_CERT, loadKeys } from './keys.ts';
import { idpApp } from './idp.ts';
import { expensesApp } from './app.ts';
import { resetState, state } from './state.ts';
import { esc, icon, page } from './ui.ts';

const keys = loadKeys();
const idp = idpApp(keys), expenses = expensesApp(keys);

const hub = new Hono();
hub.get('/', c => {
  const done = c.req.query('reset');
  return c.html(page({ site: 'hub', title: 'Home', body: `
<div class="stack">
  <div><span class="pill">${icon('flask')} PeelSec SAML lab</span><h1 style="margin-top:14px">SAML single sign-on, the way it works at work</h1>
  <p class="lead">${IDP_NAME} is the company's identity provider, like Okta or Entra. ${APP_NAME} is an app its people use. Everything runs on this Mac, with test data only.</p></div>
  ${done ? `<div class="flash">${icon('check')} ${done === 'empty' ? `Reset to empty: ${IDP_NAME} has no applications and ${APP_NAME} trusts no identity provider. Set it up from the start.`
    : 'Reset: both sides are set up, and everyone is signed out.'}</div>` : ''}
  <div class="grid2">
    <section class="card stack"><div class="row"><span class="pill">${icon('building')} ${IDP_NAME}</span><span class="small">Identity provider (IdP)</span></div>
      <p class="muted">Signs John in, and sends each app a signed SAML response. Its admin sets up the apps in Applications.</p>
      <p class="mono">${esc(base('idp').replace('https://', ''))}</p>
      <div class="row"><a class="btn" href="${base('idp')}/">Open</a><a class="btn ghost" href="${base('idp')}/admin/apps">Applications</a></div></section>
    <section class="card stack"><div class="row"><span class="pill">${icon('receipt')} ${APP_NAME}</span><span class="small">Service provider (SP)</span></div>
      <p class="muted">Sends John to ${IDP_NAME}, checks the answer, and shows what arrived. Its admin sets up single sign-on.</p>
      <p class="mono">${esc(base('app').replace('https://', ''))}</p>
      <div class="row"><a class="btn" href="${base('app')}/">Open</a><a class="btn ghost" href="${base('app')}/admin/sso">Single sign-on</a></div></section>
  </div>
  <section class="card"><dl class="facts">
    <dt>Test user</dt><dd>${USER.username}, password ${USER.password}</dd>
    <dt>Set up now</dt><dd>${state.apps.size ? `${IDP_NAME} has ${state.apps.size} application${state.apps.size > 1 ? 's' : ''}` : `${IDP_NAME} has no applications`};
      ${state.sp.on ? `${APP_NAME} trusts ${esc(state.sp.idpName || state.sp.entityId)}` : `${APP_NAME}'s single sign-on is off`}</dd>
  </dl></section>
  <div class="row"><a class="btn" href="${base('app')}/">Start at ${APP_NAME} ${icon('arrow')}</a>
    <a class="btn ghost" href="/reset?to=ready">${icon('again')} Reset: everything set up</a>
    <a class="btn ghost" href="/reset?to=empty">${icon('again')} Reset: start empty</a></div>
</div>` }));
});
hub.get('/reset', c => {
  const to = c.req.query('to') === 'empty' ? 'empty' : 'ready';
  resetState(to, keys);
  return c.redirect(`/?reset=${to}`, 303);
});

// One listener; the address (Host) picks the site.
const listener = getRequestListener((req: Request) => {
  const { hostname: host, pathname } = new URL(req.url);
  // No icon, and no 404 for it: Chrome's developer tools showed the 404 as a red error badge in E13's demo (2026-10-30).
  if (pathname === '/favicon.ico') return new Response(null, { status: 204 });
  return (host === HOSTS.idp ? idp : host === HOSTS.app ? expenses : hub).fetch(req);
});

function listen(make: () => Server, port: number, address: string): Promise<Server | null> {
  return new Promise(resolve => {
    const s = make();
    s.once('error', () => resolve(null));
    s.listen(port, address, () => resolve(s));
  });
}
// On both loopbacks: Chrome may try ::1 first for *.localhost (fine if this Mac has no IPv6 loopback).
async function listenBoth(make: () => Server, port: number): Promise<boolean> {
  if (!await listen(make, port, '127.0.0.1')) return false;
  await listen(make, port, '::1');
  return true;
}

const ports = process.env.PORT ? [Number(process.env.PORT)] : [443, 8443];
const httpsServer = () => createHttpsServer({ key: keys.tlsKey, cert: keys.tlsCert }, listener);
let port = 0;
for (const p of ports) if (await listenBoth(httpsServer, p)) { port = p; break; }
if (!port) { console.error(`Could not listen on port ${ports.join(' or ')}. Set another one: PORT=9443 npm start`); process.exit(1); }
setPort(port);
resetState('ready', keys);  // after the port: the set-up addresses include it

// Plain http only sends the browser on to https.
const redirect = () => createServer((req, res) => {
  const host = (req.headers.host ?? 'localhost').split(':')[0];
  res.writeHead(301, { location: `https://${host}${port === 443 ? '' : `:${port}`}${req.url ?? '/'}` }).end();
});
const httpPort = port === 443 ? 80 : 8080;
const redirecting = await listenBoth(redirect, httpPort);

console.log(`PeelSec SAML lab is running, on this Mac only, with test data:
  Lab home   ${base('hub')}
  ${APP_NAME.padEnd(12)} ${base('app')}    the app (service provider)
  ${IDP_NAME.padEnd(12)} ${base('idp')}    the identity provider
Test user: ${USER.username}, password ${USER.password}.${redirecting ? ` http on port ${httpPort} sends you to https.` : ''}
For https with no warning, trust the lab's certificate authority once (it asks for your Mac password):
  security add-trusted-cert -r trustRoot -k ~/Library/Keychains/login.keychain-db ${CA_CERT}
Stop it with Ctrl+C.`);
