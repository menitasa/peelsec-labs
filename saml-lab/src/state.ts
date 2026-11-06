// What the lab remembers while it runs (in memory only: a restart, or a reset on the lab home, starts clean).
import { APP_ACCOUNT, APP_NAME, IDP_NAME, SP_DEFAULTS, USER, acsUrl, appEntityId, base, idpEntityId, newApp, resetUser } from './config.ts';
import type { Account, AppConfig, NameLink, SpTrust } from './config.ts';
import type { Arrival, Login } from './saml.ts';
import type { Keys } from './saml.ts';

export type IdpSession = { user: string; authnInstant: string; sessionIndex: string };
// acs: where this answer goes (v0.5: picked from the request); forced: the app asked for a fresh sign-in, and Example Corp obeys.
export type Pending = { appId: string; requestId: string; relayState: string; acs?: string; forced?: boolean };
export type LastRequest = { at: string; param: string; xml: string; relayState: string; signature: 'ok' | 'bad' | 'none' };

export const state = {
  apps: new Map<string, AppConfig>(),            // Example Corp's applications
  sp: { on: false, idpName: '', entityId: '', ssoUrl: '', cert: '', ...SP_DEFAULTS } as SpTrust,  // Expenses' single sign-on settings
  idpSessions: new Map<string, IdpSession>(),
  idpPending: new Map<string, Pending>(),         // a sign-in Example Corp still has to answer, by its own id
  lastRequest: null as LastRequest | null,        // the last request it got, for its "Last request" page
  appSessions: new Map<string, Login & { at: string; account?: string; linked?: boolean }>(),  // account: Expenses' account (v0.6); none with a transient name
  appPending: new Set<string>(),                  // the IDs of requests Expenses sent and got no answer to yet
  used: new Set<string>(),                        // the IDs of assertions Expenses already took
  lastArrival: null as Arrival | null,            // for Expenses' "What arrived" page
  // v0.6 (E14): Expenses' accounts and its links from a Name ID to an account; a sign-in waiting to be linked.
  accounts: new Map<string, Account>(),
  links: [] as NameLink[],
  toLink: new Map<string, { login: Login; at: string }>(),
};

// "ready": both sides set up, the way an admin leaves them after the setup. "empty": nothing trusted anywhere, to show
// the setup from the start.
export function resetState(to: 'ready' | 'empty', keys: Keys): void {
  state.idpSessions.clear(); state.idpPending.clear(); state.lastRequest = null;
  state.appSessions.clear(); state.appPending.clear(); state.used.clear(); state.lastArrival = null;
  state.apps.clear();
  resetUser(); state.accounts.clear(); state.links = []; state.toLink.clear();
  state.sp = { on: false, idpName: '', entityId: '', ssoUrl: '', cert: '', ...SP_DEFAULTS };
  if (to === 'ready') {
    state.apps.set('expenses', { ...newApp({ id: 'expenses', name: APP_NAME, entityId: appEntityId(), acsUrl: acsUrl(), encryptCert: keys.appCert }), spSigningCert: keys.appCert });
    // Since v0.5 the app's own sign-in address at Example Corp (as Okta and Google give each app one), so a wrong
    // identifier shows up at the app as a wrong Audience, not as "this app isn't set up".
    state.sp = { on: true, idpName: IDP_NAME, entityId: idpEntityId(), ssoUrl: `${base('idp')}/sso/expenses`, cert: keys.idpCert, ...SP_DEFAULTS };
    // v0.6: John's account at Expenses, with his reports, already found by his email: both sides know him by the same
    // address, the way most apps start (the overview's out-of-band linking, 5.4.2). A persistent name isn't linked yet.
    state.accounts.set(APP_ACCOUNT.id, { ...APP_ACCOUNT, reports: true, made: 'admin' });
    state.links.push({ idp: idpEntityId(), nameId: USER.email, account: APP_ACCOUNT.id, at: 'set up by the admin' });
  }
}
