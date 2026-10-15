/**
 * SHA-256, HMAC-SHA256 et PBKDF2 en JavaScript pur (aucun module natif ne fournit PBKDF2 sur Expo).
 * Sert à dériver la clé AES d'une sauvegarde à partir du mot de passe choisi par le propriétaire.
 * Vérifié dans les tests contre l'implémentation de Node (crypto.pbkdf2Sync).
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be,
  0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa,
  0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85,
  0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
  0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const W = new Uint32Array(64);

function compresser(etat: Uint32Array, bloc: Uint8Array, decalage: number) {
  for (let i = 0; i < 16; i++) {
    const j = decalage + i * 4;
    W[i] = (bloc[j] << 24) | (bloc[j + 1] << 16) | (bloc[j + 2] << 8) | bloc[j + 3];
  }
  for (let i = 16; i < 64; i++) {
    const a = W[i - 15];
    const b = W[i - 2];
    const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
    const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
    W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
  }
  let [a, b, c, d, e, f, g, h] = etat;
  for (let i = 0; i < 64; i++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const ch = (e & f) ^ (~e & g);
    const t1 = (h + S1 + ch + K[i] + W[i]) | 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (S0 + maj) | 0;
    h = g;
    g = f;
    f = e;
    e = (d + t1) | 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) | 0;
  }
  etat[0] += a;
  etat[1] += b;
  etat[2] += c;
  etat[3] += d;
  etat[4] += e;
  etat[5] += f;
  etat[6] += g;
  etat[7] += h;
}

export function sha256(donnees: Uint8Array): Uint8Array {
  const etat = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const longueur = donnees.length;
  const total = Math.ceil((longueur + 9) / 64) * 64;
  const bloc = new Uint8Array(total);
  bloc.set(donnees);
  bloc[longueur] = 0x80;
  const bits = longueur * 8;
  const vue = new DataView(bloc.buffer);
  vue.setUint32(total - 8, Math.floor(bits / 0x100000000));
  vue.setUint32(total - 4, bits >>> 0);
  for (let i = 0; i < total; i += 64) compresser(etat, bloc, i);
  const sortie = new Uint8Array(32);
  const vueSortie = new DataView(sortie.buffer);
  for (let i = 0; i < 8; i++) vueSortie.setUint32(i * 4, etat[i]);
  return sortie;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const r = new Uint8Array(a.length + b.length);
  r.set(a);
  r.set(b, a.length);
  return r;
}

export function hmacSha256(cle: Uint8Array, message: Uint8Array): Uint8Array {
  const bloc = new Uint8Array(64);
  bloc.set(cle.length > 64 ? sha256(cle) : cle);
  const ipad = bloc.map((x) => x ^ 0x36);
  const opad = bloc.map((x) => x ^ 0x5c);
  return sha256(concat(opad, sha256(concat(ipad, message))));
}

/** PBKDF2-HMAC-SHA256 (RFC 8018). */
export function pbkdf2Sha256(motDePasse: Uint8Array, sel: Uint8Array, iterations: number, longueur: number): Uint8Array {
  const sortie = new Uint8Array(longueur);
  const blocs = Math.ceil(longueur / 32);
  for (let i = 1; i <= blocs; i++) {
    const indice = new Uint8Array([(i >>> 24) & 0xff, (i >>> 16) & 0xff, (i >>> 8) & 0xff, i & 0xff]);
    let u = hmacSha256(motDePasse, concat(sel, indice));
    const t = u.slice();
    for (let n = 1; n < iterations; n++) {
      u = hmacSha256(motDePasse, u);
      for (let k = 0; k < 32; k++) t[k] ^= u[k];
    }
    sortie.set(t.subarray(0, Math.min(32, longueur - (i - 1) * 32)), (i - 1) * 32);
  }
  return sortie;
}
