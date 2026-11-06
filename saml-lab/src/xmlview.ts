// SAML XML, laid out to read on screen: one element per line, long attribute lists one per line (like chapter 5's
// example), colors for tags, names and values, long base64 values cut, and, for an assertion, each part marked
// with what it means, in the series' own words.
import { DOMParser } from '@xmldom/xmldom';
import type { Element, Node } from '@xmldom/xmldom';
import { esc } from './ui.ts';

const SHORT = new Set(['SignatureValue', 'X509Certificate', 'CipherValue', 'DigestValue']);
const WIDTH = 72;

// The parts of an assertion: chapter 5 says it holds who made it, who it's about, the rules for trusting it, and the facts.
export const PARTS: Record<string, { label: string; color: string }> = {
  Issuer: { label: 'Who made it', color: '#818CF8' },
  Signature: { label: "The identity provider's signature", color: '#C084FC' },
  Subject: { label: "Who it's about", color: '#38BDF8' },
  Conditions: { label: 'The rules for trusting it', color: '#FBBF24' },
  AuthnStatement: { label: 'How and when the user logged in', color: '#34D399' },
  AttributeStatement: { label: 'Facts about the user: attributes, or claims', color: '#F472B6' },
};
// Inside a part: chapter 6's subject confirmation, in the subject, says who may use the assertion.
const INNER_PARTS: Record<string, { label: string; color: string }> = {
  SubjectConfirmation: { label: 'Who may use it', color: '#FB923C' },
};
const REQUEST_PARTS: Record<string, { label: string; color: string }> = {
  Issuer: { label: 'Who asks', color: '#818CF8' },
  NameIDPolicy: { label: 'What kind of name it wants for the user', color: '#38BDF8' },
};

const name = (el: Element): string => el.tagName;
const attrHtml = (a: { name: string; value: string }, shortVal = false): string => {
  const ns = a.name === 'xmlns' || a.name.startsWith('xmlns:');
  // Only something like base64 is cut: names, formats and addresses stay whole.
  const v = shortVal && a.value.length > 80 && !/^(urn:|https?:)/.test(a.value) ? esc(a.value.slice(0, 60)) + '<span class="t-short">…</span>' : esc(a.value);
  return `<span class="${ns ? 't-ns' : 't-attr'}">${esc(a.name)}</span><span class="t-p">="</span><span class="${ns ? 't-ns' : 't-val'}">${v}</span><span class="t-p">"</span>`;
};
const ln = (d: number, html: string): string => `<div class="ln" style="--d:${d}">${html}</div>`;

type Parts = Record<string, { label: string; color: string }>;
function render(el: Element, d: number, opts: { parts?: Parts; top?: boolean; inner?: Parts }): string {
  const attrs = Array.from({ length: el.attributes.length }, (_, i) => el.attributes.item(i)!).map(a => ({ name: a.name, value: a.value }));
  const kids = Array.from({ length: el.childNodes.length }, (_, i) => el.childNodes.item(i)!)
    .filter((n: Node) => n.nodeType === 1 || (n.nodeType === 3 && (n.nodeValue ?? '').trim()));
  const tagOpen = `<span class="t-p">&lt;</span><span class="t-tag">${esc(name(el))}</span>`;
  const close = `<span class="t-p">&lt;/</span><span class="t-tag">${esc(name(el))}</span><span class="t-p">&gt;</span>`;
  const oneLine = `${name(el)} ${attrs.map(a => `${a.name}="${a.value}"`).join(' ')}`.length + d * 2 < WIDTH;
  const end = kids.length ? '<span class="t-p">&gt;</span>' : '<span class="t-p">/&gt;</span>';
  let out = '';
  if (!attrs.length || oneLine) out += ln(d, tagOpen + attrs.map(a => ' ' + attrHtml(a)).join('') + (kids.length === 1 && kids[0].nodeType === 3 ? '' : end));
  else {
    out += ln(d, tagOpen);
    attrs.forEach((a, i) => { out += ln(d + 2, attrHtml(a, true) + (i === attrs.length - 1 && !(kids.length === 1 && kids[0].nodeType === 3) ? end : '')); });
  }
  if (kids.length === 1 && kids[0].nodeType === 3) {
    const t = (kids[0].nodeValue ?? '').trim();
    const shown = SHORT.has(el.localName ?? '') && t.length > 24 ? `${esc(t.slice(0, 20))}<span class="t-short">…</span>` : esc(t);
    const inline = `<span class="t-p">&gt;</span><span class="t-txt">${shown}</span>${close}`;
    // On one line when it fits; else the text gets its own line, so a tag never breaks in the middle.
    const head = `${name(el)} ${attrs.map(a => `${a.name}="${a.value}"`).join(' ')}`.length;
    const fits = d * 2 + head + Math.min(t.length, SHORT.has(el.localName ?? '') ? 21 : t.length) + name(el).length + 5 <= WIDTH;
    if ((!attrs.length || oneLine) && fits) out = out.replace(/<\/div>$/, inline + '</div>');
    else out = out.replace(/<\/div>$/, '<span class="t-p">&gt;</span></div>') + ln(d + 1, `<span class="t-txt">${shown}</span>`) + ln(d, close);
    return out;
  }
  for (const k of kids) {
    if (k.nodeType === 3) { out += ln(d + 1, `<span class="t-txt">${esc((k.nodeValue ?? '').trim())}</span>`); continue; }
    const child = k as Element;
    const part = opts.top && opts.parts ? opts.parts[child.localName ?? ''] : undefined;
    const inner = part ? undefined : opts.inner?.[child.localName ?? ''];
    let html = render(child, d + 1, { parts: opts.parts, inner: opts.inner });
    if (part && child.localName === 'Signature') {
      html = `<details class="sig"><summary>${ln(d + 1, `<span class="t-p">&lt;</span><span class="t-tag">${esc(name(child))}</span><span class="t-p">&gt; … &lt;/</span><span class="t-tag">${esc(name(child))}</span><span class="t-p">&gt;</span><span class="hint">open it</span>`)}</summary>${html}</details>`;
    }
    if (inner) html = `<div class="part inner" style="--c:${inner.color}">${ln(d + 1, `<span class="tag">${esc(inner.label)}</span>`)}${html}</div>`;
    out += part ? `<div class="part" style="--c:${part.color}"><div class="tag">${esc(part.label)}</div>${html}</div>` : html;
  }
  return out + (kids.length ? ln(d, close) : '');
}

export function xmlHtml(xml: string, opts: { parts?: 'assertion' | 'request' } = {}): string {
  const root = new DOMParser().parseFromString(xml, 'text/xml').documentElement;
  if (!root) return `<div class="code">${esc(xml)}</div>`;
  const parts = opts.parts === 'assertion' ? PARTS : opts.parts === 'request' ? REQUEST_PARTS : undefined;
  return `<div class="code">${render(root, 0, { parts, top: true, inner: opts.parts === 'assertion' ? INNER_PARTS : undefined })}</div>`;
}
