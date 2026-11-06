// The look of the lab: two brands the viewer tells apart at a glance (Example Corp dark blue, Expenses light and teal),
// big text that reads on a phone in a 1920 x 1080 video, and smooth page changes within a site (view transitions).
import { base } from './config.ts';
import type { Site } from './config.ts';

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Line icons, 24 x 24, drawn with the text color.
const ICONS: Record<string, string> = {
  plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  minus: '<path d="M5 12h14"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  flask: '<path d="M9 3h6M10 3v6L4 20a1 1 0 0 0 .9 1.5h14.2a1 1 0 0 0 .9-1.5L14 9V3"/><path d="M6.5 15h11"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  again: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M8 7h8M8 11h8M8 15h5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
};
export const icon = (name: string, cls = 'ic'): string =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;

const BRANDS: Record<Site, { name: string; tag: string; logo: string; nav: [string, string][] }> = {
  idp: { name: 'Example Corp', tag: 'Sign-in', logo: 'building', nav: [['/', 'My apps'], ['/admin/apps', 'Applications'], ['/admin/users', 'Users'], ['/request', 'Last request'], ['/metadata', 'Metadata']] },
  app: { name: 'Expenses', tag: 'Expense reports', logo: 'receipt', nav: [['/', 'Home'], ['/arrived', 'What arrived'], ['/admin/users', 'Users'], ['/admin/sso', 'Single sign-on'], ['/metadata', 'Metadata']] },
  hub: { name: 'SAML lab', tag: 'PeelSec', logo: 'flask', nav: [] },
};

const CSS = `
@view-transition { navigation: auto; }
::view-transition-old(root), ::view-transition-new(root) { animation-duration: .28s; }
@media (prefers-reduced-motion: reduce) { @view-transition { navigation: none; } * { transition: none !important; animation: none !important; } }
:root { color-scheme: light; --ink: #1E2140; --muted: #4A5068; --label: #6B7094; --line: #E3E5EF; --card: #FFFFFF;
  --ok: #15803D; --ok-bg: #DCFCE7; --bad: #B42318; --bad-bg: #FEE4E2; --skip: #6B7094; --skip-bg: #ECEEF6;
  --radius: 18px; --shadow: 0 1px 2px rgba(16,24,40,.05), 0 12px 32px -10px rgba(16,24,40,.16); }
body.idp { --brand: #1D4ED8; --brand-2: #60A5FA; --head: linear-gradient(115deg, #0A1A44 0%, #13307A 55%, #1D4ED8 100%); --head-fg: #FFFFFF; --bg: #EEF2FB; }
body.app { --brand: #0F766E; --brand-2: #2DD4BF; --head: #FFFFFF; --head-fg: #0B2A27; --bg: #F2F8F7; }
body.hub { --brand: #4F46E5; --brand-2: #A5B4FC; --head: #1E2140; --head-fg: #FFFFFF; --bg: #F6F7FB; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; font: 18px/1.55 'IBM Plex Sans', system-ui, -apple-system, sans-serif; color: var(--ink); background: var(--bg); min-height: 100vh; display: flex; flex-direction: column; }
a { color: var(--brand); text-underline-offset: 3px; }
.wrap { width: min(920px, 100% - 48px); margin-inline: auto; }
.top { background: var(--head); color: var(--head-fg); view-transition-name: top; }
body.app .top { border-bottom: 1px solid var(--line); }
.top .wrap { display: flex; align-items: center; gap: 24px; min-height: 76px; }
.logo { display: flex; align-items: center; gap: 12px; color: inherit; text-decoration: none; font-weight: 700; font-size: 24px; letter-spacing: -.01em; }
.logo .mark { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; background: var(--brand); color: #fff; }
body.idp .logo .mark { background: rgba(255,255,255,.14); box-shadow: inset 0 0 0 1px rgba(255,255,255,.25); }
.logo small { display: block; font-size: 14px; font-weight: 500; opacity: .75; letter-spacing: .02em; }
.top nav { margin-left: auto; display: flex; gap: 4px; flex-wrap: wrap; }
.top nav a { color: inherit; text-decoration: none; font-size: 16px; font-weight: 500; padding: 8px 12px; border-radius: 10px; opacity: .85; }
.top nav a:hover, .top nav a[aria-current] { opacity: 1; background: color-mix(in srgb, currentColor 10%, transparent); }
.ic { width: 24px; height: 24px; flex: none; }
main { flex: 1; padding: 40px 0 56px; }
h1 { font-size: 40px; line-height: 1.15; letter-spacing: -.02em; margin: 0 0 12px; }
h2 { font-size: 26px; line-height: 1.25; letter-spacing: -.01em; margin: 0 0 12px; }
h3 { font-size: 20px; margin: 0 0 6px; }
p { margin: 0 0 14px; }
.lead { font-size: 20px; color: var(--muted); max-width: 46ch; }
.muted { color: var(--muted); }
.small { font-size: 15px; color: var(--label); }
.called { display: block; font-size: 14px; color: var(--label); margin-top: 6px; }
.called b { font-weight: 600; color: var(--ink, #1F2937); }
.stack > * + * { margin-top: 20px; }
.row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
@media (max-width: 720px) { .grid2 { grid-template-columns: 1fr; } h1 { font-size: 32px; } }
.card { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); padding: 28px; }
.card.flat { box-shadow: none; }
.hero { background: var(--head); color: var(--head-fg); border-radius: 24px; padding: 40px; position: relative; overflow: hidden; }
body.app .hero { background: linear-gradient(120deg, #E6F6F3 0%, #F4FBF9 60%, #FFFFFF 100%); border: 1px solid #D5ECE7; color: var(--ink); }
.hero .lead { color: inherit; opacity: .85; }
.hero .big-ic { position: absolute; right: -10px; bottom: -24px; width: 220px; height: 220px; opacity: .12; }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 10px; font-family: inherit; font-size: 18px; font-weight: 600; line-height: 1; padding: 15px 22px; border-radius: 12px;
  border: 0; background: var(--brand); color: #fff; cursor: pointer; text-decoration: none; transition: transform .15s, box-shadow .15s, filter .15s; }
.btn:hover { transform: translateY(-1px); box-shadow: 0 8px 20px -8px var(--brand); filter: brightness(1.06); }
.btn:active { transform: none; }
.btn:focus-visible, input:focus-visible, summary:focus-visible { outline: 3px solid color-mix(in srgb, var(--brand) 45%, transparent); outline-offset: 2px; }
.btn.ghost { background: transparent; color: var(--brand); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--brand) 45%, transparent); }
.btn.light { background: #fff; color: var(--brand); }
.btn.wide { width: 100%; }
.field { display: grid; gap: 6px; margin-bottom: 16px; }
.field span { font-size: 16px; font-weight: 600; }
.field span.called { font-size: 14px; font-weight: 400; }
input[type=text], input[type=password] { font: inherit; padding: 14px 16px; border: 1.5px solid var(--line); border-radius: 12px; width: 100%; background: #fff; color: var(--ink); }
input[type=text]:focus, input[type=password]:focus { border-color: var(--brand); outline: 3px solid color-mix(in srgb, var(--brand) 25%, transparent); }
.note { display: flex; gap: 12px; align-items: flex-start; font-size: 16px; color: var(--muted); background: color-mix(in srgb, var(--brand) 6%, #fff);
  border: 1.5px dashed color-mix(in srgb, var(--brand) 35%, transparent); border-radius: 14px; padding: 14px 16px; }
.note .ic { color: var(--brand); margin-top: 2px; }
.note b { color: var(--ink); }
.pill { display: inline-flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; padding: 6px 12px; border-radius: 999px; background: color-mix(in srgb, var(--brand) 12%, #fff); color: var(--brand); }
.flash { display: flex; gap: 12px; align-items: center; font-weight: 600; padding: 14px 18px; border-radius: 14px; background: var(--ok-bg); color: var(--ok); }
.result { display: flex; gap: 16px; align-items: center; padding: 20px 24px; border-radius: var(--radius); font-size: 20px; font-weight: 700; }
.result .ic { width: 32px; height: 32px; }
.result.ok { background: var(--ok-bg); color: var(--ok); }
.result.bad { background: var(--bad-bg); color: var(--bad); }
.result small { display: block; font-size: 16px; font-weight: 500; opacity: .9; }
.checks { list-style: none; margin: 0; padding: 0; }
.checks li { display: grid; grid-template-columns: 40px 1fr; gap: 14px; align-items: start; padding: 14px 0; border-top: 1px solid var(--line); }
.checks li:first-child { border-top: 0; }
.checks .dot { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; }
.checks .dot .ic { width: 20px; height: 20px; stroke-width: 3; }
.checks .ok .dot { background: var(--ok-bg); color: var(--ok); }
.checks .bad .dot { background: var(--bad-bg); color: var(--bad); }
.checks .skip .dot { background: var(--skip-bg); color: var(--skip); }
.checks b { display: block; font-size: 18px; }
.checks .skip b { color: var(--label); }
.checks span { font-size: 16px; color: var(--muted); overflow-wrap: anywhere; }
.code { background: #141831; color: #E6E8F5; border-radius: 16px; padding: 20px 22px; font: 15px/1.6 'JetBrains Mono', ui-monospace, Menlo, monospace; overflow-wrap: anywhere; }
.code .ln { padding-left: calc(var(--d, 0) * 2ch); white-space: pre-wrap; }
.t-tag { color: #A5B4FC; } .t-attr { color: #7DD3FC; } .t-val { color: #86EFAC; } .t-txt { color: #F8FAFC; } .t-p { color: #8B90B8; } .t-ns { color: #6B7094; }
.t-short { color: #FDBA8C; }
.part { border-left: 4px solid var(--c); padding: 2px 0 4px 14px; margin: 10px 0 14px -18px; }
.part.inner { border-left: 0; padding: 0; margin: 8px 0 0; }
.part .tag { display: inline-flex; align-items: center; gap: 8px; font: 600 14px/1.2 'IBM Plex Sans', system-ui, sans-serif; color: var(--c);
  background: color-mix(in srgb, var(--c) 16%, transparent); border-radius: 999px; padding: 5px 12px; margin: 0 0 6px; }
details.sig > summary { list-style: none; cursor: pointer; }
details.sig > summary::-webkit-details-marker { display: none; }
details.sig > summary .hint { font: 500 14px 'IBM Plex Sans', system-ui, sans-serif; color: #C4B5FD; margin-left: 10px; }
.caption { font-size: 15px; color: var(--label); margin-top: 10px; }
.carried { font: 15px/1.6 'JetBrains Mono', ui-monospace, Menlo, monospace; background: #fff; border: 1.5px solid var(--line); border-radius: 14px; padding: 16px 18px; overflow-wrap: anywhere; color: var(--muted); }
.carried b { color: var(--ink); font-family: 'IBM Plex Sans', system-ui, sans-serif; }
.flow { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; align-items: center; }
.flow .arrowbox { display: grid; place-items: center; color: var(--label); }
dl.facts { display: grid; grid-template-columns: max-content 1fr; gap: 10px 20px; margin: 0; }
dl.facts dt { color: var(--label); font-size: 16px; }
dl.facts dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
dl.facts dd code, .mono { font-family: 'JetBrains Mono', ui-monospace, Menlo, monospace; font-size: 16px; font-weight: 500; }
fieldset { border: 0; padding: 0; margin: 0 0 24px; }
legend { font-weight: 700; font-size: 18px; margin-bottom: 4px; padding: 0; }
.hint { font-size: 15px; color: var(--label); margin: 0 0 10px; }
.seg { display: inline-flex; flex-wrap: wrap; gap: 4px; background: #E9ECF5; padding: 5px; border-radius: 14px; }
.seg label { position: relative; }
.seg input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
.seg span { display: block; padding: 10px 16px; border-radius: 10px; font-weight: 600; font-size: 16px; color: var(--muted); transition: background .15s, color .15s; }
.seg input:checked + span { background: #fff; color: var(--brand); box-shadow: 0 1px 2px rgba(16,24,40,.08), 0 4px 10px -4px rgba(16,24,40,.18); }
.seg input:focus-visible + span { outline: 3px solid color-mix(in srgb, var(--brand) 45%, transparent); }
.chips { display: flex; flex-wrap: wrap; gap: 10px; }
.chips label { position: relative; }
.chips input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
.chips span { display: block; padding: 10px 14px; border-radius: 12px; border: 1.5px solid var(--line); background: #fff; font-size: 16px; }
.chips span em { font-style: normal; color: var(--label); margin-left: 6px; }
.chips input:checked + span { border-color: var(--brand); background: color-mix(in srgb, var(--brand) 8%, #fff); color: var(--brand); font-weight: 600; }
.chips input:focus-visible + span { outline: 3px solid color-mix(in srgb, var(--brand) 45%, transparent); }
.switch { display: flex; gap: 14px; align-items: center; cursor: pointer; position: relative; }
.switch input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.switch .track { width: 52px; height: 30px; border-radius: 999px; background: #CBD0E1; position: relative; flex: none; transition: background .2s; }
.switch .track::after { content: ''; position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.25); transition: transform .2s; }
.switch input:checked + .track { background: var(--brand); }
.switch input:checked + .track::after { transform: translateX(22px); }
.switch input:focus-visible + .track { outline: 3px solid color-mix(in srgb, var(--brand) 45%, transparent); outline-offset: 2px; }
.spinner { width: 44px; height: 44px; border-radius: 50%; border: 4px solid color-mix(in srgb, var(--brand) 20%, transparent); border-top-color: var(--brand); animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
textarea, select, input[type=url] { font: 15px/1.5 'JetBrains Mono', ui-monospace, Menlo, monospace; padding: 12px 14px; border: 1.5px solid var(--line); border-radius: 12px; width: 100%; background: #fff; color: var(--ink); }
input[type=url] { font: inherit; }
textarea { min-height: 120px; resize: vertical; }
select { font: inherit; width: auto; }
textarea:focus, select:focus, input[type=url]:focus { border-color: var(--brand); outline: 3px solid color-mix(in srgb, var(--brand) 25%, transparent); }
.section { display: grid; gap: 4px; }
.section h2 { display: flex; gap: 12px; align-items: center; }
.section h2 .num { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: var(--brand); color: #fff; font-size: 17px; }
.or { display: flex; align-items: center; gap: 14px; color: var(--label); font-size: 15px; margin: 6px 0 14px; }
.or::before, .or::after { content: ''; flex: 1; height: 1px; background: var(--line); }
.claims { width: 100%; border-collapse: collapse; }
.claims th { text-align: left; font-size: 15px; color: var(--label); font-weight: 600; padding: 0 0 8px; }
.claims td { padding: 8px 12px 8px 0; border-top: 1px solid var(--line); vertical-align: middle; }
.claims td input[type=text] { padding: 10px 12px; font: 15px 'JetBrains Mono', ui-monospace, Menlo, monospace; }
.check { display: inline-flex; gap: 10px; align-items: center; font-weight: 600; cursor: pointer; }
.check input { width: 20px; height: 20px; accent-color: var(--brand); }
.copyrow { display: grid; grid-template-columns: 220px 1fr auto; gap: 12px; align-items: center; padding: 10px 0; border-top: 1px solid var(--line); }
.copyrow:first-of-type { border-top: 0; }
.copyrow b { font-size: 16px; }
.copyrow input { font: 15px 'JetBrains Mono', ui-monospace, Menlo, monospace; padding: 10px 12px; border: 1.5px solid var(--line); border-radius: 10px; background: #F8F9FC; color: var(--ink); width: 100%; }
.btn.small { padding: 10px 14px; font-size: 15px; }
@media (max-width: 720px) { .copyrow { grid-template-columns: 1fr; } }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
.tile { display: grid; gap: 14px; justify-items: start; background: #fff; border: 1px solid var(--line); border-radius: 18px; padding: 22px; text-decoration: none; color: var(--ink); box-shadow: var(--shadow); transition: transform .15s, box-shadow .15s; }
.tile:hover { transform: translateY(-2px); }
.tile .mark { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 14px; background: #0F766E; color: #fff; }
.tile .mark .ic { width: 30px; height: 30px; }
.tile b { font-size: 20px; }
.apps { width: 100%; border-collapse: collapse; }
.apps td, .apps th { text-align: left; padding: 14px 12px 14px 0; border-top: 1px solid var(--line); vertical-align: middle; }
.apps th { border-top: 0; font-size: 15px; color: var(--label); font-weight: 600; }
.apps .mono { font-size: 15px; overflow-wrap: anywhere; }
.error-card { border-left: 6px solid var(--bad); }
.signin { min-height: calc(100vh - 76px - 56px - 96px); display: grid; place-items: center; }
.signin .card { width: min(480px, 100%); }
footer { border-top: 1px solid var(--line); background: #fff; }
footer .wrap { display: flex; gap: 16px; align-items: center; min-height: 56px; font-size: 14px; color: var(--label); }
footer a { color: inherit; }
`;

export function page(o: { site: Site; title: string; body: string; path?: string }): string {
  const b = BRANDS[o.site];
  const nav = b.nav.map(([href, label]) => `<a href="${href}"${o.path === href ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)} · ${b.name}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap">
<style>${CSS}</style></head>
<body class="${o.site}">
<header class="top"><div class="wrap"><a class="logo" href="/"><span class="mark">${icon(b.logo)}</span><span>${b.name}<small>${b.tag}</small></span></a><nav>${nav}</nav></div></header>
<main><div class="wrap">${o.body}</div></main>
<script>document.addEventListener('click', e => { const b = e.target.closest('[data-copy]'); if (!b) return;
  navigator.clipboard?.writeText(document.getElementById(b.dataset.copy).value); const t = b.lastChild.textContent; b.lastChild.textContent = ' Copied';
  setTimeout(() => { b.lastChild.textContent = t; }, 1200); });</script>
<footer><div class="wrap">${icon('flask')}<span>PeelSec SAML lab · test data only, on this Mac</span><a href="${base('hub')}" style="margin-left:auto">Lab home</a></div></footer>
</body></html>`;
}

export function checksList(checks: { label: string; ok: boolean | null; detail: string }[]): string {
  return `<ul class="checks">${checks.map(c => {
    const cls = c.ok === null ? 'skip' : c.ok ? 'ok' : 'bad';
    return `<li class="${cls}"><span class="dot">${icon(c.ok === null ? 'minus' : c.ok ? 'check' : 'x')}</span><div><b>${esc(c.label)}</b><span>${esc(c.detail)}</span></div></li>`;
  }).join('')}</ul>`;
}

// A value to copy into the other side's settings, with a Copy button.
export const copyRow = (id: string, label: string, value: string): string =>
  `<div class="copyrow"><b>${esc(label)}</b><input id="${id}" type="text" readonly value="${esc(value)}"><button class="btn ghost small" type="button" data-copy="${id}">${icon('copy')}<span> Copy</span></button></div>`;

// A long base64 value, cut for the screen: the start, then how long it really is.
export const cut = (s: string, keep = 180): string => s.length <= keep ? esc(s) : `${esc(s.slice(0, keep))}<span class="t-short">… (${s.length.toLocaleString('en-US')} characters)</span>`;
