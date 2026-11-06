// Fetches metadata from an address an admin typed. Lab addresses only (localhost and names under it): the lab stays
// on your own computer, and the request goes to 127.0.0.1, checked with the lab's own certificate authority.
import { request } from 'node:https';

export function fetchText(url: string, ca: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let u: URL;
    try { u = new URL(url); } catch { return reject(new Error("That isn't a web address.")); }
    if (u.protocol !== 'https:') return reject(new Error('Use an https address.'));
    const local = u.hostname === 'localhost' || u.hostname.endsWith('.localhost');
    if (!local) return reject(new Error('The lab reads metadata only from lab addresses (localhost, or a name ending in .localhost). Paste the XML instead.'));
    const req = request({
      host: local ? '127.0.0.1' : u.hostname, port: u.port || 443, path: u.pathname + u.search, servername: u.hostname,
      headers: { host: u.host, accept: 'application/samlmetadata+xml, application/xml, text/xml' }, timeout: 8000, ...(local ? { ca } : {}),
    }, res => {
      if ((res.statusCode ?? 0) >= 400) { res.resume(); return reject(new Error(`The address answered ${res.statusCode}.`)); }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', d => { body += d; if (body.length > 1_000_000) req.destroy(new Error('Too big for metadata.')); });
      res.on('end', () => resolve(body));
    });
    req.on('timeout', () => req.destroy(new Error('No answer in 8 seconds.')));
    req.on('error', e => reject(e));
    req.end();
  });
}
