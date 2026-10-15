/** Serveur statique minimal pour prévisualiser la landing page : node scripts/serve-landing.mjs [port] */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', 'landing');
const PORT = Number(process.argv[2] ?? 4173);
const TYPES = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8' };

createServer(async (req, res) => {
  const chemin = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  const fichier = join(RACINE, chemin || 'index.html');
  if (!fichier.startsWith(RACINE)) return res.writeHead(403).end();
  try {
    const contenu = await readFile(fichier);
    res.writeHead(200, { 'Content-Type': TYPES[extname(fichier)] ?? 'application/octet-stream' }).end(contenu);
  } catch {
    res.writeHead(404).end('Introuvable');
  }
}).listen(PORT, () => console.log(`Landing : http://localhost:${PORT}`));
