/**
 * Captures d'écran réelles de l'application pour la landing page.
 * Prérequis : aperçu web lancé (`npx expo start --web --port 8081`) et Google Chrome installé.
 * Usage : node scripts/captures-landing.mjs
 * Le profil Chrome est temporaire : un jeu de démonstration y est créé (window.__onileDemo, aperçu web
 * de développement uniquement), puis l'application est déverrouillée (PIN de démo 2580) et photographiée.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = join(RACINE, 'landing', 'captures');
const URL_APP = process.env.ONILE_URL ?? 'http://localhost:8081';
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const profil = mkdtempSync(join(tmpdir(), 'onile-captures-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profil}`,
  '--no-first-run',
  '--disable-gpu',
  'about:blank',
]);

async function cible() {
  for (let i = 0; i < 50; i++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = pages.find((p) => p.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* Chrome démarre */
    }
    await pause(200);
  }
  throw new Error('Chrome ne répond pas.');
}

const ws = new WebSocket(await cible());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const attentes = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && attentes.has(m.id)) {
    attentes.get(m.id)(m);
    attentes.delete(m.id);
  }
});
const cdp = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const n = ++id;
    attentes.set(n, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const evaluer = async (expression) => (await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;

/** Clique au centre du dernier élément visible dont le texte (ou l'aria-label) correspond exactement. */
async function cliquer(texte) {
  await evaluer(`(() => { const t = ${JSON.stringify(texte)}; const el = [...document.querySelectorAll('*')].filter((e) => e.getAttribute('aria-label') === t || (e.children.length === 0 && e.textContent.trim() === t)).pop(); el?.scrollIntoView({ block: 'center' }); })()`);
  await pause(300);
  const rect = await evaluer(`(() => {
    const t = ${JSON.stringify(texte)};
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false;
      const dessus = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!dessus && (el.contains(dessus) || dessus.contains(el));
    };
    const els = [...document.querySelectorAll('*')].filter(
      (el) => (el.getAttribute('aria-label') === t || (el.children.length === 0 && el.textContent.trim() === t)) && visible(el)
    );
    const el = els[els.length - 1];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (!rect) throw new Error(`Élément introuvable : ${texte}`);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp('Input.dispatchMouseEvent', { type, x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  }
  await pause(900);
}

async function capturer(nom, { pleineHauteur = false, rogner = false } = {}) {
  await pause(800);
  const { data } = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: pleineHauteur });
  const fichier = join(SORTIE, `${nom}.webp`);
  let image = sharp(Buffer.from(data, 'base64'));
  // Document : on retire les marges blanches puis on remet une marge régulière.
  if (rogner) image = sharp(await image.trim({ background: '#ffffff' }).toBuffer()).extend({ top: 48, bottom: 48, left: 48, right: 48, background: '#ffffff' });
  await image.webp({ quality: 82 }).toFile(fichier);
  console.log('capture', fichier);
}

async function deverrouiller() {
  await cdp('Page.reload');
  await pause(9000);
  for (const chiffre of ['2', '5', '8', '0']) await cliquer(chiffre);
  await pause(2500);
}

/** Écrit dans le dernier champ de saisie visible (clavier simulé). */
async function saisir(texte) {
  await evaluer(`(() => {
    const c = [...document.querySelectorAll('input')].find((i) => i.inputMode === 'decimal') ?? [...document.querySelectorAll('input')].pop();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(c, ${JSON.stringify(texte)});
    c.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await pause(600);
}

/** Remplace la page par le document affiché dans l'aperçu, pour le photographier seul. */
async function documentSeul(selecteur) {
  await evaluer(`(() => { const html = document.querySelector(${JSON.stringify(selecteur)}).srcdoc; document.open(); document.write(html.replace('</head>', '<style>html,body{overflow:hidden}</style></head>')); document.close(); })()`);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 820, height: 1100, deviceScaleFactor: 1.5, mobile: false });
}

try {
  mkdirSync(SORTIE, { recursive: true });
  await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Page.navigate', { url: URL_APP });
  await pause(15000);
  await evaluer('window.__onileDemo()');
  await cdp('Page.reload');
  await pause(10000);
  await capturer('pin');
  for (const chiffre of ['2', '5', '8', '0']) await cliquer(chiffre);
  // Premier lancement : la visite guidée démarre d'elle-même sur l'accueil.
  await pause(3500);
  await capturer('visite');
  // Pour les autres captures, sans visite guidée.
  await evaluer(`localStorage.setItem('onile.preferences', JSON.stringify({ 'visite.desactivee': true }))`);
  await deverrouiller();
  await capturer('accueil');
  await evaluer(`[...document.querySelectorAll('[aria-label^="Notifications"]')].pop().click()`);
  await pause(1200);
  await capturer('notifications');
  await cliquer('Retour');
  await cliquer('Loyers');
  await capturer('loyers');
  await cliquer('Locataires');
  await capturer('locataires');
  await cliquer('Awa Houngbo');
  await evaluer("[...document.querySelectorAll('div')].filter(e => e.children.length === 0 && e.textContent === 'Échéancier').pop()?.scrollIntoView()");
  await capturer('fiche-locataire');
  await cliquer('Contrat de bail (signature, PDF)');
  await pause(1200);
  await capturer('contrat');
  await cliquer('Retour');
  await cliquer('Finances');
  await pause(1500);
  await capturer('finances');
  await cliquer('Logements');
  await pause(1200);
  await capturer('logements');
  await cliquer('Chambre 1');
  await pause(1500);
  await capturer('chambre');
  await deverrouiller();
  await cliquer('Loyers');
  await cliquer('Koffi Mensah');
  await cliquer('Reçu');
  await pause(2000);
  await cliquer('Partager (PDF)');
  await pause(1500);
  // Le document seul, sans la barre de l'aperçu : on remplace la page par le HTML du reçu.
  await evaluer("(() => { const html = document.querySelector('#onile-apercu-document iframe').srcdoc; document.open(); document.write(html.replace('</head>', '<style>html,body{overflow:hidden}</style></head>')); document.close(); })()");
  await cdp('Emulation.setDeviceMetricsOverride', { width: 820, height: 1000, deviceScaleFactor: 1.5, mobile: false });
  await capturer('recu', { rogner: true });

  // Électricité : relevé au-delà de l'index de coupure, avis au locataire et message WhatsApp.
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Page.navigate', { url: URL_APP });
  await pause(9000);
  for (const chiffre of ['2', '5', '8', '0']) await cliquer(chiffre);
  await pause(2500);
  await cliquer('Électricité');
  await pause(1200);
  await capturer('electricite');
  await cliquer('Koffi Mensah');
  await cliquer('Saisir un relevé');
  await saisir('825');
  await cliquer('Enregistrer le relevé');
  await pause(1500);
  await cliquer('Voir l’avis et l’envoyer');
  await pause(2500);
  await capturer('whatsapp');
  await documentSeul('iframe[title="Aperçu du document"]');
  await capturer('avis-electricite', { rogner: true });
  writeFileSync(join(SORTIE, 'LISEZMOI.txt'), `Captures générées le ${new Date().toISOString()} par scripts/captures-landing.mjs (données de démonstration).\n`);
} finally {
  ws.close();
  chrome.kill();
  await pause(500);
  rmSync(profil, { recursive: true, force: true, maxRetries: 5 });
}
