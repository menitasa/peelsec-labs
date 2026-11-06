// The SAML in the lab: the request Expenses sends, the response Example Corp makes (signed, and encrypted when the
// application's settings say so), the checks Expenses runs on what arrives, and both sides' metadata. Real SAML 2.0
// messages, made by hand so every line on screen is one we chose.
import { constants, createCipheriv, createDecipheriv, createHmac, createPublicKey, privateDecrypt, publicEncrypt, randomBytes, sign as rsaSign, verify as rsaVerify } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import type { Element } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';
import { APP_NAME, AUTHN_CLASSES, NAMEID_FORMATS, USER, nameIdValue, acsUrl, appEntityId, destinationOf, idpEntityId, recipientOf, ssoUrl, groupsPassing } from './config.ts';
import type { AppConfig, SpTrust } from './config.ts';
import { certBody, toPem } from './keys.ts';
import type { loadKeys } from './keys.ts';

export type Keys = ReturnType<typeof loadKeys>;

export const NS = {
  samlp: 'urn:oasis:names:tc:SAML:2.0:protocol',
  saml: 'urn:oasis:names:tc:SAML:2.0:assertion',
  ds: 'http://www.w3.org/2000/09/xmldsig#',
  xenc: 'http://www.w3.org/2001/04/xmlenc#',
  md: 'urn:oasis:names:tc:SAML:2.0:metadata',
} as const;
const BEARER = 'urn:oasis:names:tc:SAML:2.0:cm:bearer';
const SUCCESS = 'urn:oasis:names:tc:SAML:2.0:status:Success';
const AES_GCM = 'http://www.w3.org/2009/xmlenc11#aes256-gcm';
const RSA_OAEP = 'http://www.w3.org/2001/04/xmlenc#rsa-oaep-mgf1p';

export const newId = (): string => '_' + randomBytes(16).toString('hex');
export const isoNow = (seconds = 0): string => new Date(Date.now() + seconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function parse(xml: string): Element {
  const root = new DOMParser().parseFromString(xml, 'text/xml').documentElement;
  if (!root) throw new Error('No XML in it');
  return root;
}
export const serialize = (el: Element): string => new XMLSerializer().serializeToString(el);
export function kids(el: Element | undefined, ns: string, name: string): Element[] {
  const out: Element[] = [];
  for (let n = el?.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1 && (n as Element).localName === name && (n as Element).namespaceURI === ns) out.push(n as Element);
  }
  return out;
}
export const kid = (el: Element | undefined, ns: string, name: string): Element | undefined => kids(el, ns, name)[0];
export const text = (el: Element | undefined): string => (el?.textContent ?? '').trim();

// ---------- the request (Expenses to Example Corp, in the address: the HTTP Redirect binding) ----------

// Where to answer: by address (AssertionConsumerServiceURL, with the binding), or by number (AssertionConsumerServiceIndex),
// never both (SAML Core 3.4.1). ForceAuthn: "sign the user in again, even if they already did".
export function authnRequest(o: { id: string; destination: string; acsIndex?: number; forceAuthn?: boolean }): string {
  const where = o.acsIndex ? `AssertionConsumerServiceIndex="${o.acsIndex}"`
    : `AssertionConsumerServiceURL="${acsUrl()}" ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"`;
  return `<samlp:AuthnRequest xmlns:samlp="${NS.samlp}" xmlns:saml="${NS.saml}" ID="${o.id}" Version="2.0" IssueInstant="${isoNow()}" `
    + `Destination="${esc(o.destination)}"${o.forceAuthn ? ' ForceAuthn="true"' : ''} ${where}>`
    + `<saml:Issuer>${appEntityId()}</saml:Issuer><samlp:NameIDPolicy AllowCreate="true"/></samlp:AuthnRequest>`;
}

// A request signed the HTTP Redirect binding's way (SAML Bindings 3.4.4.1): the signature covers the query string
// SAMLRequest=...&RelayState=...&SigAlg=..., exactly as sent, and travels next to it as &Signature=.
export const RSA_SHA256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
export function signedQuery(samlRequest: string, relayState: string, key: string): string {
  const signed = `SAMLRequest=${encodeURIComponent(samlRequest)}`
    + (relayState ? `&RelayState=${encodeURIComponent(relayState)}` : '') + `&SigAlg=${encodeURIComponent(RSA_SHA256)}`;
  return `${signed}&Signature=${encodeURIComponent(rsaSign('sha256', Buffer.from(signed, 'utf8'), key).toString('base64'))}`;
}
// Checks it from the raw query string as it arrived (the values still encoded, as signed). 'none' when it isn't signed.
export function checkQuerySignature(rawQuery: string, cert: string): 'ok' | 'bad' | 'none' {
  const parts = rawQuery.replace(/^\?/, '').split('&');
  const get = (k: string) => parts.find(p => p.startsWith(k + '='));
  const sig = get('Signature'), alg = get('SigAlg');
  if (!sig) return 'none';
  if (!cert || !alg || decodeURIComponent(alg.slice(7)) !== RSA_SHA256) return 'bad';
  const signed = ['SAMLRequest', 'RelayState', 'SigAlg'].map(get).filter(Boolean).join('&');
  try {
    return rsaVerify('sha256', Buffer.from(signed, 'utf8'), createPublicKey(toPem(cert)), Buffer.from(decodeURIComponent(sig.slice(10)), 'base64')) ? 'ok' : 'bad';
  } catch { return 'bad'; }
}
// Compressed with deflate, then base64: what goes in ?SAMLRequest= (the address bar only takes text, and not much of it).
export const encodeRedirect = (xml: string): string => deflateRawSync(Buffer.from(xml, 'utf8')).toString('base64');
export const decodeRedirect = (param: string): string => inflateRawSync(Buffer.from(param, 'base64')).toString('utf8');

export function readAuthnRequest(xml: string) {
  const root = parse(xml);
  if (root.localName !== 'AuthnRequest' || root.namespaceURI !== NS.samlp) throw new Error('This is not a SAML AuthnRequest.');
  const index = root.getAttribute('AssertionConsumerServiceIndex');
  return { id: root.getAttribute('ID') ?? '', issuer: text(kid(root, NS.saml, 'Issuer')), acs: root.getAttribute('AssertionConsumerServiceURL') ?? '',
    acsIndex: index ? Number(index) : undefined, forceAuthn: root.getAttribute('ForceAuthn') === 'true' };
}

// ---------- the response (Example Corp to the app, through the browser: the HTTP POST binding) ----------

// A persistent name: the same made-up name for John every time he goes to an app, and a different one at any other
// app, so apps can't match their notes on him (part 3 of the series). The source's example is azqu3H7.
const B62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
export function pseudonym(secret: string, sp: string): string {
  // v0.6: from Example Corp's fixed user ID, not the sign-in name, so it stays when John's email changes (E14).
  const h = createHmac('sha256', secret).update(`${USER.userId}|${sp}`).digest();
  return Array.from(h.subarray(0, 7), b => B62[b % 62]).join('');
}

function sign_(xml: string, root: 'Assertion' | 'Response', keys: Keys): string {
  const sig = new SignedXml({
    privateKey: keys.idpKey, publicCert: keys.idpCert,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
  });
  sig.addReference({
    xpath: `/*[local-name(.)='${root}']`,
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/2001/10/xml-exc-c14n#'],
    inclusiveNamespacesPrefixList: root === 'Assertion' ? ['xs'] : [],
  });
  // The schema puts the signature right after the Issuer.
  sig.computeSignature(xml, { prefix: 'ds', location: { reference: `/*[local-name(.)='${root}']/*[local-name(.)='Issuer']`, action: 'after' } });
  return sig.getSignedXml();
}

// XML Encryption: the assertion is locked with a new one-time AES key, and that key is locked with the app's public key
// (from its certificate), so only the app's private key opens it. The browser carries it, but can't read it.
function encrypt(assertionXml: string, appCert: string): string {
  const key = randomBytes(32), iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([iv, c.update(assertionXml, 'utf8'), c.final(), c.getAuthTag()]);
  const wrapped = publicEncrypt({ key: createPublicKey(toPem(appCert)), padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha1' }, key);
  return `<saml:EncryptedAssertion xmlns:saml="${NS.saml}"><xenc:EncryptedData xmlns:xenc="${NS.xenc}" Type="http://www.w3.org/2001/04/xmlenc#Element">`
    + `<xenc:EncryptionMethod Algorithm="${AES_GCM}"/><ds:KeyInfo xmlns:ds="${NS.ds}"><xenc:EncryptedKey>`
    + `<xenc:EncryptionMethod Algorithm="${RSA_OAEP}"><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/></xenc:EncryptionMethod>`
    + `<xenc:CipherData><xenc:CipherValue>${wrapped.toString('base64')}</xenc:CipherValue></xenc:CipherData></xenc:EncryptedKey></ds:KeyInfo>`
    + `<xenc:CipherData><xenc:CipherValue>${data.toString('base64')}</xenc:CipherValue></xenc:CipherData></xenc:EncryptedData></saml:EncryptedAssertion>`;
}

function decrypt(encrypted: Element, appKey: string): string {
  const ed = kid(encrypted, NS.xenc, 'EncryptedData');
  if (kid(ed, NS.xenc, 'EncryptionMethod')?.getAttribute('Algorithm') !== AES_GCM) throw new Error('Unknown encryption');
  const ek = ed?.getElementsByTagNameNS(NS.xenc, 'EncryptedKey')[0];
  const wrapped = Buffer.from(text(kid(kid(ek, NS.xenc, 'CipherData'), NS.xenc, 'CipherValue')), 'base64');
  const key = privateDecrypt({ key: appKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha1' }, wrapped);
  const data = Buffer.from(text(kid(kid(ed, NS.xenc, 'CipherData'), NS.xenc, 'CipherValue')), 'base64');
  const d = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
  d.setAuthTag(data.subarray(data.length - 16));
  return Buffer.concat([d.update(data.subarray(12, data.length - 16)), d.final()]).toString('utf8');
}

export type Issued = { xml: string; base64: string; assertionId: string };

// acs: the reply address this answer goes to (the default one, one picked by number, or one a signed request named).
export function buildResponse(o: { keys: Keys; app: AppConfig; acs?: string; inResponseTo?: string; authnInstant: string; sessionIndex: string }): Issued {
  const { keys, app } = o;
  const now = isoNow(), until = isoNow(app.validFor), aid = newId(), rid = newId();
  const idp = app.issuer || idpEntityId();
  const acs = o.acs || app.acsUrl;
  const inResp = o.inResponseTo ? ` InResponseTo="${esc(o.inResponseTo)}"` : '';
  const nameId = app.format === 'persistent' ? pseudonym(keys.secret, app.entityId) : app.format === 'transient' ? newId() : nameIdValue(app.nameIdFrom);
  const qualifiers = app.format === 'persistent' || app.format === 'transient' ? ` NameQualifier="${idp}" SPNameQualifier="${esc(app.entityId)}"` : '';
  // v0.8 (E19): one attribute can carry several values: the group attribute writes one AttributeValue per group.
  const attribute = (name: string, values: string[]) => `<saml:Attribute Name="${esc(name)}" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">`
    + values.map(v => `<saml:AttributeValue xsi:type="xs:string">${esc(v)}</saml:AttributeValue>`).join('') + `</saml:Attribute>`;
  const groups = app.groupOn && app.groupName ? groupsPassing(app.groupFilter, app.groupValue) : [];
  const attrs = [...app.claims.map(c => attribute(c.name, [USER[c.field]])), ...(groups.length ? [attribute(app.groupName, groups)] : [])];
  const attrXml = attrs.length ? `<saml:AttributeStatement>${attrs.join('')}</saml:AttributeStatement>` : '';
  const xsNs = attrs.length ? ' xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' : '';
  let assertion = `<saml:Assertion xmlns:saml="${NS.saml}"${xsNs} ID="${aid}" Version="2.0" IssueInstant="${now}">`
    + `<saml:Issuer>${idp}</saml:Issuer>`
    + `<saml:Subject><saml:NameID Format="${NAMEID_FORMATS[app.format]}"${qualifiers}>${esc(nameId)}</saml:NameID>`
    + `<saml:SubjectConfirmation Method="${BEARER}"><saml:SubjectConfirmationData${inResp} Recipient="${esc(recipientOf(app, acs))}" NotOnOrAfter="${until}"/>`
    + `</saml:SubjectConfirmation></saml:Subject>`
    + `<saml:Conditions NotBefore="${now}" NotOnOrAfter="${until}"><saml:AudienceRestriction><saml:Audience>${esc(app.entityId)}</saml:Audience>`
    + `</saml:AudienceRestriction></saml:Conditions>`
    + `<saml:AuthnStatement AuthnInstant="${o.authnInstant}" SessionIndex="${o.sessionIndex}"><saml:AuthnContext>`
    + `<saml:AuthnContextClassRef>${AUTHN_CLASSES[app.authnClass]}</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement>`
    + attrXml + `</saml:Assertion>`;
  // The order matters: sign the assertion, then encrypt it, then sign the whole response. "Unsigned" is a lab option.
  const sign = app.unsigned ? 'none' : app.sign;
  if (sign === 'assertion' || sign === 'both') assertion = sign_(assertion, 'Assertion', keys);
  if (app.encrypt && app.encryptCert) assertion = encrypt(assertion, app.encryptCert);
  let xml = `<samlp:Response xmlns:samlp="${NS.samlp}" xmlns:saml="${NS.saml}" ID="${rid}" Version="2.0" IssueInstant="${now}" `
    + `Destination="${esc(destinationOf(app, acs))}"${inResp}><saml:Issuer>${idp}</saml:Issuer>`
    + `<samlp:Status><samlp:StatusCode Value="${SUCCESS}"/></samlp:Status>${assertion}</samlp:Response>`;
  if (sign === 'response' || sign === 'both') xml = sign_(xml, 'Response', keys);
  return { xml, base64: Buffer.from(xml, 'utf8').toString('base64'), assertionId: aid };
}

// ---------- what the app does with what arrives ----------

export type Check = { key: string; label: string; ok: boolean | null; detail: string };
export type Login = { nameId: string; format: string; attributes: { name: string; values: string[] }[]; sessionIndex: string; authnInstant: string };
export type Arrival = {
  at: string; acs: string; base64: string; relayState: string; responseXml: string;
  encryptedXml?: string; assertionXml?: string; checks: Check[]; ok: boolean; login?: Login;
};

// Checks a signature with the identity provider's certificate (from the app's settings, never from the message), and
// returns the signed element, read back from what was signed: the rest of the document is not trusted.
function verify(xml: string, sigEl: Element, cert: string, rootName: string, id: string | null): Element | null {
  const sig = new SignedXml({ publicCert: toPem(cert), getCertFromKeyInfo: () => null });
  try {
    sig.loadSignature(serialize(sigEl));
    if (!sig.checkSignature(xml)) return null;
  } catch { return null; }
  const refs = sig.getSignedReferences();
  if (refs.length !== 1) return null;
  const signed = parse(refs[0]);
  return signed.localName === rootName && signed.getAttribute('ID') === id ? signed : null;
}

const clock = (t: string | number | null | undefined): string =>
  t == null || t === '' ? '(none)' : new Date(t).toISOString().slice(11, 19) + ' UTC';
const short = (id: string): string => id.length > 12 ? id.slice(0, 9) + '…' : id;

// at: the reply address it arrived at (Expenses has two, /acs and /acs/2): Recipient and Destination must name it.
export function receive(o: { base64: string; relayState: string; at: string; keys: Keys; idp: SpTrust; pending: Set<string>; used: Set<string> }): Arrival {
  const idpName = o.idp.idpName || 'the identity provider';
  const L = {
    signature: `Signed by ${idpName}`, issuer: `Made by ${idpName}`, status: `${idpName} says the sign-in worked`,
    audience: 'Meant for this app', time: 'Inside its time window', recipient: 'Sent to this address',
    request: 'An answer to our own request', replay: 'Not used before', decrypt: 'Opened with our private key',
  };
  const checks: Check[] = [];
  const add = (key: string, label: string, ok: boolean | null, detail: string) => { checks.push({ key, label, ok, detail }); };
  const arrival: Arrival = { at: new Date().toISOString(), acs: o.at, base64: o.base64, relayState: o.relayState, responseXml: '', checks, ok: false };
  const stop = (key: string, label: string, detail: string): Arrival => {
    add(key, label, false, detail);
    for (const k of ['signature', 'issuer', 'status', 'audience', 'time', 'recipient', 'request', 'replay'] as const) {
      if (!checks.some(c => c.key === k)) add(k, L[k], null, 'Not checked: a check before it failed.');
    }
    return arrival;
  };

  let root: Element;
  try {
    arrival.responseXml = Buffer.from(o.base64, 'base64').toString('utf8');
    root = parse(arrival.responseXml);
  } catch { return stop('read', 'A SAML response', 'This is not readable XML.'); }
  if (root.localName !== 'Response' || root.namespaceURI !== NS.samlp) return stop('read', 'A SAML response', 'This is not a SAML response.');
  if (!o.idp.cert) return stop('signature', L.signature, "The app has no certificate to check it with: single sign-on isn't set up.");

  // The response's own signature, if it has one. It covers everything inside, the assertion too.
  let signedResponse: Element | null = null;
  const rSig = kid(root, NS.ds, 'Signature');
  if (rSig) {
    signedResponse = verify(arrival.responseXml, rSig, o.idp.cert, 'Response', root.getAttribute('ID'));
    if (!signedResponse) return stop('signature', L.signature, "The response's signature doesn't match: something in it changed after it was signed, or another key signed it.");
  }
  const resp = signedResponse ?? root;

  const plain = kids(resp, NS.saml, 'Assertion'), enc = kids(resp, NS.saml, 'EncryptedAssertion');
  if (plain.length + enc.length !== 1) {
    return stop('one', 'One assertion', `The response holds ${plain.length + enc.length} assertions. The app expects exactly one.`);
  }
  // The assertion as it arrived (its own signature is checked on that), or opened from the encrypted one.
  let assertionXml: string;
  if (enc.length) {
    arrival.encryptedXml = serialize(enc[0]);
    try { assertionXml = decrypt(enc[0], o.keys.appKey); } catch {
      return stop('decrypt', L.decrypt, "It doesn't open with this app's private key: it was made for another app, or changed.");
    }
    add('decrypt', L.decrypt, true, "The assertion was encrypted for this app. Only this app's private key opens it.");
  } else {
    // Not from the response's signed copy: its canonical form can drop a namespace the assertion's own signature covers.
    const raw = kids(root, NS.saml, 'Assertion');
    if (raw.length !== 1 || raw[0].getAttribute('ID') !== plain[0].getAttribute('ID')) {
      return stop('one', 'One assertion', 'The signed response and the message hold different assertions.');
    }
    assertionXml = serialize(raw[0]);
  }
  arrival.assertionXml = assertionXml;

  // The assertion's own signature, if it has one.
  let a: Element;
  try { a = parse(assertionXml); } catch { return stop('read', 'A SAML assertion', 'The assertion is not readable XML.'); }
  let signedAssertion: Element | null = null;
  const aSig = kid(a, NS.ds, 'Signature');
  if (aSig) {
    signedAssertion = verify(assertionXml, aSig, o.idp.cert, 'Assertion', a.getAttribute('ID'));
    if (!signedAssertion) return stop('signature', L.signature, "The assertion's signature doesn't match: something in it changed after it was signed, or another key signed it.");
  }
  if (!signedAssertion && !signedResponse) return stop('signature', L.signature, 'Nothing is signed. Anyone could have typed this assertion.');
  // v0.7 (E15): what this app requires to be signed. With 'either' (the default) one signature is enough, as before.
  const req = o.idp.requireSigned;
  if (req !== 'either') {
    const needs = req === 'response' ? 'the whole response to be signed' : req === 'assertion' ? 'the assertion to be signed' : 'both the assertion and the whole response to be signed';
    if ((req === 'response' || req === 'both') && !signedResponse) return stop('signature', L.signature, `The response isn't signed. ${APP_NAME} requires ${needs}.`);
    if ((req === 'assertion' || req === 'both') && !signedAssertion) return stop('signature', L.signature, `The assertion isn't signed. ${APP_NAME} requires ${needs}.`);
  }
  add('signature', L.signature, true, signedAssertion && signedResponse
    ? `The assertion and the whole response carry ${idpName}'s signature, and both match its certificate.`
    : signedAssertion ? `The assertion carries ${idpName}'s signature, and it matches ${idpName}'s certificate.`
    : `The whole response carries ${idpName}'s signature, and it covers the assertion inside.`);
  // From here on, only what a signature covers: the assertion's signed copy, or the one inside the signed response.
  a = signedAssertion ?? (enc.length ? a : plain[0]);

  const issuer = text(kid(a, NS.saml, 'Issuer'));
  add('issuer', L.issuer, issuer === o.idp.entityId, `Issuer: ${issuer || '(none)'}`);
  const status = kid(kid(resp, NS.samlp, 'Status'), NS.samlp, 'StatusCode')?.getAttribute('Value') ?? '';
  add('status', L.status, status === SUCCESS, `Status: ${status.split(':').pop() || '(none)'}`);
  const cond = kid(a, NS.saml, 'Conditions');
  const audiences = kids(cond, NS.saml, 'AudienceRestriction').flatMap(r => kids(r, NS.saml, 'Audience').map(text));
  add('audience', L.audience, audiences.includes(appEntityId()), `Audience: ${audiences.join(', ') || '(none)'}`);
  const subject = kid(a, NS.saml, 'Subject');
  const scd = kid(kid(subject, NS.saml, 'SubjectConfirmation'), NS.saml, 'SubjectConfirmationData');
  const nb = cond?.getAttribute('NotBefore'), until = cond?.getAttribute('NotOnOrAfter'), now = Date.now();
  const inWindow = (!nb || Date.parse(nb) - 2000 <= now) && (!until || now < Date.parse(until))
    && (!scd?.getAttribute('NotOnOrAfter') || now < Date.parse(scd.getAttribute('NotOnOrAfter') ?? ''));
  add('time', L.time, inWindow, `From ${clock(nb)} until ${clock(until)}. Now it's ${clock(now)}.`);
  // Recipient (in the assertion) MUST name the reply address it arrived at (SAML Profiles 4.1.4.3); Destination (on the
  // response), if present, MUST too (SAML Core 3.2.2).
  const recipient = scd?.getAttribute('Recipient') ?? '', destination = resp.getAttribute('Destination') ?? '';
  const sentHere = recipient === o.at && (!destination || destination === o.at);
  add('recipient', L.recipient, sentHere, sentHere ? `Recipient and Destination: ${o.at}`
    : `It arrived at ${o.at}. Recipient: ${recipient || '(none)'}. Destination: ${destination || '(none)'}.`);
  const method = kid(subject, NS.saml, 'SubjectConfirmation')?.getAttribute('Method');
  const inResp = scd?.getAttribute('InResponseTo');
  if (inResp) {
    const known = o.pending.delete(inResp);
    add('request', L.request, known && method === BEARER, known
      ? `It answers our request ${short(inResp)}.`
      : `It answers request ${short(inResp)}, which this app didn't send, or already got an answer to.`);
  } else if (o.idp.acceptUnsolicited) add('request', `Started at ${idpName}`, method === BEARER, `No request to match: John started at ${idpName}.`);
  else add('request', L.request, false, `No InResponseTo: nobody asked for this answer, and this app takes only answers to its own requests.`);
  const aid = a.getAttribute('ID') ?? '';
  const fresh = !o.used.has(aid);
  o.used.add(aid);
  add('replay', L.replay, fresh, fresh ? 'The first time this app sees this assertion.' : 'This app already took this exact assertion once. A copy is turned away.');

  arrival.ok = checks.every(c => c.ok);
  if (arrival.ok) {
    const nameIdEl = kid(subject, NS.saml, 'NameID');
    const authn = kid(a, NS.saml, 'AuthnStatement');
    arrival.login = {
      nameId: text(nameIdEl), format: nameIdEl?.getAttribute('Format') ?? '',
      attributes: kids(kid(a, NS.saml, 'AttributeStatement'), NS.saml, 'Attribute').map(at => ({
        name: at.getAttribute('Name') ?? '', values: kids(at, NS.saml, 'AttributeValue').map(text),
      })),
      sessionIndex: authn?.getAttribute('SessionIndex') ?? '', authnInstant: authn?.getAttribute('AuthnInstant') ?? '',
    };
  }
  return arrival;
}

// ---------- metadata: how each side tells the other its addresses and keys ----------

const keyInfo = (cert: string): string =>
  `<ds:KeyInfo xmlns:ds="${NS.ds}"><ds:X509Data><ds:X509Certificate>${certBody(cert)}</ds:X509Certificate></ds:X509Data></ds:KeyInfo>`;

export const idpMetadata = (keys: Keys): string =>
  `<md:EntityDescriptor xmlns:md="${NS.md}" entityID="${idpEntityId()}">`
  + `<md:IDPSSODescriptor protocolSupportEnumeration="${NS.samlp}" WantAuthnRequestsSigned="false">`
  + `<md:KeyDescriptor use="signing">${keyInfo(keys.idpCert)}</md:KeyDescriptor>`
  + Object.values(NAMEID_FORMATS).map(f => `<md:NameIDFormat>${f}</md:NameIDFormat>`).join('')
  + `<md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="${ssoUrl()}"/>`
  + `</md:IDPSSODescriptor></md:EntityDescriptor>`;

// v0.5: the signing key too (Expenses signs its requests with the same key), and its second reply address, number 1.
// v0.7: WantAssertionsSigned is true when the app requires a signed assertion (Metadata 2.4.4). Metadata has no flag
// for "the response must be signed", so that requirement shows only in the app's settings.
export const spMetadata = (keys: Keys, signsRequests = false, wantsAssertionsSigned = false): string =>
  `<md:EntityDescriptor xmlns:md="${NS.md}" entityID="${appEntityId()}">`
  + `<md:SPSSODescriptor protocolSupportEnumeration="${NS.samlp}" AuthnRequestsSigned="${signsRequests}" WantAssertionsSigned="${wantsAssertionsSigned}">`
  + `<md:KeyDescriptor use="signing">${keyInfo(keys.appCert)}</md:KeyDescriptor>`
  + `<md:KeyDescriptor use="encryption">${keyInfo(keys.appCert)}<md:EncryptionMethod Algorithm="${AES_GCM}"/></md:KeyDescriptor>`
  + `<md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${acsUrl()}" index="0" isDefault="true"/>`
  + `<md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${acsUrl()}/2" index="1"/>`
  + `</md:SPSSODescriptor></md:EntityDescriptor>`;

// Reads metadata pasted or fetched by an admin: the entity ID, and what each kind of side publishes.
export type Metadata = { entityId: string; idp?: { ssoUrl: string; cert: string }; sp?: { acsUrl: string; encryptCert: string; signingCert: string; extraAcs: { index: number; url: string }[] } };
export function readMetadata(xml: string): Metadata {
  let ed = parse(xml);
  if (ed.localName === 'EntitiesDescriptor') ed = ed.getElementsByTagNameNS(NS.md, 'EntityDescriptor')[0] ?? ed;
  if (ed.localName !== 'EntityDescriptor' || ed.namespaceURI !== NS.md) throw new Error("This isn't SAML metadata (no EntityDescriptor).");
  const cert = (d: Element | undefined, use: string): string => {
    const k = kids(d, NS.md, 'KeyDescriptor').find(x => !x.getAttribute('use') || x.getAttribute('use') === use);
    return text(k?.getElementsByTagNameNS(NS.ds, 'X509Certificate')[0]);
  };
  const md: Metadata = { entityId: ed.getAttribute('entityID') ?? '' };
  const idp = kid(ed, NS.md, 'IDPSSODescriptor'), sp = kid(ed, NS.md, 'SPSSODescriptor');
  if (idp) {
    const sso = kids(idp, NS.md, 'SingleSignOnService');
    const redirect = sso.find(x => x.getAttribute('Binding')?.endsWith(':HTTP-Redirect')) ?? sso[0];
    md.idp = { ssoUrl: redirect?.getAttribute('Location') ?? '', cert: cert(idp, 'signing') };
  }
  if (sp) {
    const acs = kids(sp, NS.md, 'AssertionConsumerService').filter(x => x.getAttribute('Binding')?.endsWith(':HTTP-POST'));
    const pick = acs.find(x => x.getAttribute('isDefault') === 'true') ?? acs[0];
    const extraAcs = acs.filter(x => x !== pick && x.getAttribute('index')).map(x => ({ index: Number(x.getAttribute('index')), url: x.getAttribute('Location') ?? '' }));
    md.sp = { acsUrl: pick?.getAttribute('Location') ?? '', encryptCert: cert(sp, 'encryption'), signingCert: cert(sp, 'signing'), extraAcs };
  }
  return md;
}
