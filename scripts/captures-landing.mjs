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
  await pause(2500);
  await capturer('accueil');
  await cliquer('Loyers');
  await capturer('loyers');
  await cliquer('Locataires');
  await capturer('locataires');
  await cliquer('Awa Houngbo');
  await capturer('fiche-locataire');
  await evaluer("document.querySelector('[aria-label=\"Fermer\"]')?.click()");
  await cliquer('Finances');
  await capturer('finances');
  await cliquer('Loyers');
  await cliquer('Koffi Mensah');
  await cliquer('Reçu');
  await pause(1500);
  // Le document seul, sans la barre de l'aperçu : on remplace la page par le HTML du reçu.
  await evaluer("(() => { const html = document.querySelector('#onile-apercu-document iframe').srcdoc; document.open(); document.write(html); document.close(); })()");
  await cdp('Emulation.setDeviceMetricsOverride', { width: 820, height: 760, deviceScaleFactor: 1.5, mobile: false });
  await capturer('recu', { rogner: true });
  writeFileSync(join(SORTIE, 'LISEZMOI.txt'), `Captures générées le ${new Date().toISOString()} par scripts/captures-landing.mjs (données de démonstration).\n`);
} finally {
  ws.close();
  chrome.kill();
  await pause(500);
  rmSync(profil, { recursive: true, force: true, maxRetries: 5 });
}
