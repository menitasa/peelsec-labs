// The lab's test keys, made on the first start with openssl and kept in keys/ (never in git):
// Example Corp signs with its key, and Expenses opens encrypted assertions with its key. Plus a secret for persistent
// names, so John's made-up name at an app stays the same from one start to the next.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { X509Certificate, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { TLS_HOSTS } from './config.ts';

const DIR = join(import.meta.dirname, '..', 'keys');
export const CA_CERT = join(DIR, 'lab-ca.crt');
export const TLS_CERT = join(DIR, 'tls.crt');

const openssl = (args: string[], what: string): void => {
  const r = spawnSync('openssl', args, { encoding: 'utf8', cwd: DIR });
  if (r.status !== 0) throw new Error(`openssl could not make ${what}: ${r.stderr}`);
};

// A SAML key and its self-signed certificate (the certificate goes in the metadata).
function makeCert(name: string, host: string): void {
  if (existsSync(join(DIR, `${name}.crt`))) return;
  openssl(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '3650',
    '-subj', `/CN=${host}/O=PeelSec SAML lab (test only)`, '-keyout', `${name}.key`, '-out', `${name}.crt`], `the ${name} key`);
}

// https: the lab's own certificate authority (self-signed, test only), and a certificate it signs for the lab's
// addresses. Trust the authority once on the Mac (see the README) and Chrome shows the lab with no warning.
// The website certificate is made again when the addresses change; the authority stays, so the trust stays.
// 825 days: the longest a Mac accepts for a website's certificate.
// Name constraints (v0.5, 2026-10-29): the authority may vouch only for localhost and names under it (RFC 5280
// 4.2.1.10), so even a copy of its key, a plain file here, can't make a certificate for a real website.
function makeTls(): void {
  if (!existsSync(CA_CERT)) {
    openssl(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '3650', '-subj', '/CN=PeelSec SAML lab CA v2 (test only, localhost only)',
      '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign',
      '-addext', 'nameConstraints=critical,permitted;DNS:localhost,permitted;DNS:.localhost',
      '-keyout', 'lab-ca.key', '-out', 'lab-ca.crt'], 'the lab certificate authority');
  }
  const names = TLS_HOSTS.map(h => `DNS:${h}`);
  if (existsSync(TLS_CERT) && names.every(n => new X509Certificate(readFileSync(TLS_CERT)).subjectAltName?.split(', ').includes(n))
    && spawnSync('openssl', ['x509', '-in', TLS_CERT, '-noout', '-ext', 'authorityKeyIdentifier'], { encoding: 'utf8' }).stdout.includes('keyid')) return;
  writeFileSync(join(DIR, 'tls.cnf'), `subjectAltName=${names.join(',')}\n`
    + 'basicConstraints=CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n'
    // v0.5: the key identifiers, which strict clients require (Python 3.14: "Missing Authority Key Identifier").
    + 'subjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n');
  openssl(['req', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-subj', '/CN=localhost', '-keyout', 'tls.key', '-out', 'tls.csr'], 'the https key');
  openssl(['x509', '-req', '-in', 'tls.csr', '-CA', 'lab-ca.crt', '-CAkey', 'lab-ca.key', '-CAcreateserial', '-days', '825', '-sha256',
    '-extfile', 'tls.cnf', '-out', 'tls.crt'], 'the https certificate');
}

export function loadKeys() {
  mkdirSync(DIR, { recursive: true });
  for (const old of ['airline.key', 'airline.crt', 'cars.key', 'cars.crt']) if (existsSync(join(DIR, old))) unlinkSync(join(DIR, old));  // v0.2's names
  makeCert('idp', 'idp.localhost');
  makeCert('app', 'app.localhost');
  makeTls();
  const secretFile = join(DIR, 'secret.txt');
  if (!existsSync(secretFile)) writeFileSync(secretFile, randomBytes(32).toString('hex'));
  const read = (f: string) => readFileSync(join(DIR, f), 'utf8');
  return {
    idpKey: read('idp.key'), idpCert: read('idp.crt'),
    appKey: read('app.key'), appCert: read('app.crt'),
    tlsKey: read('tls.key'), tlsCert: read('tls.crt'), ca: read('lab-ca.crt'),
    secret: read('secret.txt').trim(),
  };
}

// A certificate's base64 body, as metadata and KeyInfo carry it; and back to PEM.
export const certBody = (pem: string): string => pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
export const toPem = (cert: string): string => {
  const b = certBody(cert);
  return b ? `-----BEGIN CERTIFICATE-----\n${b.match(/.{1,64}/g)!.join('\n')}\n-----END CERTIFICATE-----\n` : '';
};
