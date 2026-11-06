// The lab's story is SAML at work: a company's identity provider (like Okta or Entra, but ours) signs its employees in
// to the apps the company uses. Example Corp is the identity provider (IdP); Expenses, an expense-report app, is the
// service provider (SP). John Doe works at Example Corp: j.doe@example.com, the same address as chapter 5's example.
// (The series' source tells the same thing with an airline and a car rental site.)

export type Site = 'idp' | 'app' | 'hub';

export const HOSTS = { idp: 'idp.localhost', app: 'app.localhost', hub: 'localhost' } as const;
export const TLS_HOSTS = ['localhost', 'idp.localhost', 'app.localhost', 'hr.localhost'];  // hr: room for a second app
export const IDP_NAME = 'Example Corp';
export const APP_NAME = 'Expenses';

// The lab runs on https, with its own certificate authority (keys.ts). Set once the server knows its port (443 when it
// can, else 8443), so every address and entity ID matches it.
let port = 443;
export function setPort(p: number): void { port = p; }
export function base(site: Site): string { return `https://${HOSTS[site]}${port === 443 ? '' : `:${port}`}`; }

// Each side's details: its entity ID (the unique name SAML metadata gives it, here its own address) and its endpoints.
export const idpEntityId = (): string => base('idp');
export const ssoUrl = (): string => `${base('idp')}/sso`;
export const appEntityId = (): string => base('app');
export const acsUrl = (): string => `${base('app')}/acs`;

// John, the lab's one test user, as Example Corp's directory knows him. v0.6 (E14): his email can change (Example
// Corp's Users page), and his sign-in name follows it, as at many companies; userId is Example Corp's own fixed ID for
// him, made by the provider and never typed (like Entra ID's object ID). A reset puts him back as he started.
const USER_START = {
  username: 'j.doe@example.com', password: 'lab-password', displayName: 'John Doe', userId: '00u8f2k1xQ',
  email: 'j.doe@example.com', givenName: 'John', surname: 'Doe', department: 'Finance', employeeId: 'E1042',
};
export const USER = { ...USER_START };
export const resetUser = (): void => { Object.assign(USER, USER_START); };
export const NEW_EMAIL = 'john.doe@example.com';
export const emailChanged = (): boolean => USER.email !== USER_START.email;
export function changeEmail(): void {
  const to = emailChanged() ? USER_START.email : NEW_EMAIL;
  USER.email = to; USER.username = to;
}
// v0.8 (E19): John's groups, in Example Corp's directory. A list of their own, not a user field: an app gets them through
// a group attribute with a filter (AppConfig below), one AttributeValue per group that passes.
export const USER_GROUPS = ['finance-managers', 'all-staff', 'vpn-users', 'printer-3rd-floor'];
export type GroupFilter = 'starts' | 'equals' | 'contains';
export const GROUP_FILTERS: [GroupFilter, string][] = [['starts', 'Starts with'], ['equals', 'Equals'], ['contains', 'Contains']];
// The lab's own matching: capitals count. No group passes, no group attribute (the lab's choice, no platform's).
export const groupsPassing = (filter: GroupFilter, value: string): string[] => !value ? [] : USER_GROUPS.filter(g =>
  filter === 'equals' ? g === value : filter === 'contains' ? g.includes(value) : g.startsWith(value));
export type UserField = 'email' | 'givenName' | 'surname' | 'department' | 'employeeId';
export const USER_FIELDS: { key: UserField; label: string }[] = [
  { key: 'email', label: 'Email address' }, { key: 'givenName', label: 'First name' }, { key: 'surname', label: 'Last name' },
  { key: 'department', label: 'Department' }, { key: 'employeeId', label: 'Employee ID' },
];

export const NAMEID_FORMATS = {
  unspecified: 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified',
  email: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  persistent: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
  transient: 'urn:oasis:names:tc:SAML:2.0:nameid-format:transient',
} as const;
export type NameIdFormat = keyof typeof NAMEID_FORMATS;
// v0.6 (E14): which of John's fields becomes the Name ID (Okta's Application username, Entra ID's Name identifier value,
// Google's Name ID). A persistent or transient format ignores it: those are always made-up names (SAML Core 8.3.7, 8.3.8).
export type NameIdFrom = 'email' | 'prefix' | 'employeeId' | 'userId';
export const NAMEID_FROM: [NameIdFrom, string][] = [['email', 'Email'], ['prefix', 'The part before the @'], ['employeeId', 'Employee ID'], ['userId', `${IDP_NAME}'s own user ID`]];
export const nameIdValue = (from: NameIdFrom): string =>
  from === 'prefix' ? USER.email.split('@')[0] : from === 'employeeId' ? USER.employeeId : from === 'userId' ? USER.userId : USER.email;

// The authentication context class: the identity provider's label for how the user signed in (SAML Authentication
// Context). Set per app here, as Okta does; some identity providers write what really happened instead (Entra ID).
export const AUTHN_CLASSES = {
  PasswordProtectedTransport: 'urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport',
  Password: 'urn:oasis:names:tc:SAML:2.0:ac:classes:Password',
  X509: 'urn:oasis:names:tc:SAML:2.0:ac:classes:X509',
  Smartcard: 'urn:oasis:names:tc:SAML:2.0:ac:classes:Smartcard',
  MobileTwoFactorContract: 'urn:oasis:names:tc:SAML:2.0:ac:classes:MobileTwoFactorContract',
  unspecified: 'urn:oasis:names:tc:SAML:2.0:ac:classes:unspecified',
} as const;
export type AuthnClass = keyof typeof AUTHN_CLASSES;

// An application as Example Corp's admin set it up: who it is, where the answer goes, and what to send it.
// The claims are attributes (SAML's word; Microsoft's products and JWTs say claims): a name, filled from a user field.
export type Claim = { field: UserField; name: string };
// v0.5: every setting of a SAML app integration (E13 to E17), each under its SAML meaning.
export type ExtraAcs = { index: number; url: string };
export type AppConfig = {
  id: string; name: string; entityId: string; acsUrl: string; encryptCert: string;
  // Where the answer goes: Recipient (inside the assertion) and Destination (on the response), the reply address unless
  // set apart; more reply addresses an app may ask for by number; where to land after a sign-in started here.
  sameRecipient: boolean; recipientUrl: string; destinationUrl: string; extraAcs: ExtraAcs[]; defaultRelayState: string;
  // v0.8 (E19): a group attribute: on or off, its name, and the filter that picks which groups go in the answer.
  groupOn: boolean; groupName: string; groupFilter: GroupFilter; groupValue: string;
  format: NameIdFormat; nameIdFrom: NameIdFrom; claims: Claim[]; sign: 'assertion' | 'response' | 'both'; encrypt: boolean;
  // The app's requests: checked with its signing certificate when signed requests are on (then the reply address may
  // come from the request); obey "sign in again" (ForceAuthn).
  signedRequests: boolean; spSigningCert: string; honorForceAuthn: boolean;
  // The sign-in, as the answer tells it: the authentication context class, and Example Corp's own name ('' = default).
  authnClass: AuthnClass; issuer: string;
  // Lab options, test only: how long an assertion lasts, send it unsigned, stop on the form on the way.
  validFor: number; unsigned: boolean; pause: boolean;
};
export const newApp = (o: Pick<AppConfig, 'id' | 'name' | 'entityId' | 'acsUrl' | 'encryptCert'>): AppConfig =>
  ({ ...o, sameRecipient: true, recipientUrl: '', destinationUrl: '', extraAcs: [], defaultRelayState: '',
    groupOn: false, groupName: '', groupFilter: 'starts', groupValue: '',
    format: 'email', nameIdFrom: 'email', claims: [], sign: 'assertion', encrypt: false,
    signedRequests: false, spSigningCert: '', honorForceAuthn: true, authnClass: 'PasswordProtectedTransport', issuer: '',
    validFor: 600, unsigned: false, pause: false });
export const recipientOf = (a: AppConfig, acs: string): string => a.sameRecipient || !a.recipientUrl ? acs : a.recipientUrl;
export const destinationOf = (a: AppConfig, acs: string): string => a.sameRecipient || !a.destinationUrl ? acs : a.destinationUrl;

// Expenses' single sign-on settings, as its admin set them up: which identity provider it trusts, and how to reach it.
// v0.5, its side of the request: sign it, ask for a fresh sign-in, name the reply address or ask for it by number, and
// whether it takes answers nobody asked for (a sign-in started at the identity provider).
// v0.6 (E14): what Expenses does with a Name ID it has no account for: ask the person to sign in once with Expenses'
// own password and link the name to that account (the SAML overview's way, 5.4.3), make a new, empty account, or refuse.
export type UnknownName = 'link' | 'create' | 'refuse';
export type SpTrust = {
  on: boolean; idpName: string; entityId: string; ssoUrl: string; cert: string;
  signRequests: boolean; forceAuthn: boolean; acsBy: 'url' | 'index'; acsIndex: number; acceptUnsolicited: boolean;
  unknownName: UnknownName; requireSigned: RequireSigned;
  // v0.8 (E19): Expenses' own rule: the Approve button goes to anyone whose answer carries this attribute with this value.
  approvers: boolean; approversAttr: string; approversValue: string;
};
// v0.7 (E15): what Expenses requires to be signed. SAML asks that at least one is (errata E93); an app may insist on one.
// 'either' is the lab's default and its behavior before v0.7.
export type RequireSigned = 'either' | 'response' | 'assertion' | 'both';
export const SP_DEFAULTS = { signRequests: false, forceAuthn: false, acsBy: 'url' as const, acsIndex: 1, acceptUnsolicited: true, unknownName: 'link' as UnknownName, requireSigned: 'either' as RequireSigned, approvers: false, approversAttr: '', approversValue: '' };

// v0.6 (E14): Expenses' own accounts, with their own passwords (lab only), and the links from a Name ID to an account.
export type Account = { id: string; name: string; password: string; reports: boolean; made: 'admin' | 'sign-in' };
export type NameLink = { idp: string; nameId: string; account: string; at: string };
export const APP_ACCOUNT = { id: 'jdoe', name: 'John Doe', password: 'expenses-password' };
// Expenses' second reply address, for the "by number" demo: the same app, another door.
export const acsUrl2 = (): string => `${base('app')}/acs/2`;
