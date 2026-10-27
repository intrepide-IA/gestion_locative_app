import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { createMigratedDatabase } from '../../db/__tests__/nodeDatabase';
import {
  chiffrerSauvegarde,
  dechiffrerSauvegarde,
  depuisBase64,
  estFichierChiffre,
  versBase64,
  type Aes,
} from '../../domain/chiffrementSauvegarde';
import { creerClientElectricite, situationElectricite } from '../electriciteRepository';
import { creerLogement, listerLogements } from '../logementRepository';
import { entrerLocataire } from '../locataireRepository';
import { enregistrerPaiement, genererEcheances, situationLocataire } from '../loyerRepository';
import { prochainNumero } from '../numerotation';
import { enregistrerProprietaire } from '../proprietaireRepository';
import { exporterSauvegarde, reinitialiserDonnees, restaurerSauvegarde, validerSauvegarde } from '../sauvegardeRepository';

const aesNode: Aes = {
  async chiffrer(cle, clair) {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', cle, iv);
    const donnees = Buffer.concat([c.update(clair), c.final(), c.getAuthTag()]);
    return { iv, donnees };
  },
  async dechiffrer(cle, iv, donnees) {
    const d = createDecipheriv('aes-256-gcm', cle, iv);
    d.setAuthTag(donnees.subarray(donnees.length - 16));
    return Buffer.concat([d.update(donnees.subarray(0, donnees.length - 16)), d.final()]);
  },
  aleatoire: (n) => randomBytes(n),
};

async function maisonRemplie() {
  const db = await createMigratedDatabase();
  await enregistrerProprietaire(db, { nom: 'Moussa', telephone: null, adresse: null });
  const logementId = await creerLogement(db, { reference: 'Chambre 1', type: 'chambre_salon', loyer_indicatif: 25000, toilettes: 1000 });
  const { locataireId } = await entrerLocataire(db, { nom_complet: 'Awa' }, logementId, {
    date_debut: '2026-09-05',
    loyer: 25000,
    toilettes: 1000,
    caution: 50000,
    prix_kwh: 250,
    releve_initial: 0,
    jour_echeance: 5,
  });
  await genererEcheances(db, '2026-11-10');
  await enregistrerPaiement(db, { locataireId, montant: 30000, mode: 'especes', datePaiement: '2026-10-03' });
  return { db, locataireId };
}

test('export puis restauration sur un autre téléphone : données identiques, numérotation conservée', async () => {
  const { db, locataireId } = await maisonRemplie();
  const fichier = JSON.parse(JSON.stringify(await exporterSauvegarde(db)));

  const autre = await createMigratedDatabase();
  const resume = await restaurerSauvegarde(autre, fichier);
  expect(resume).toMatchObject({ proprietaire: 'Moussa', logements: 1, locataires: 1, paiements: 1 });
  expect(await situationLocataire(autre, locataireId)).toEqual(await situationLocataire(db, locataireId));
  // La séquence des reçus continue après REC-2026-00001 : aucun doublon possible.
  expect(await autre.transaction((tx) => prochainNumero(tx, 'REC', 2026))).toBe('REC-2026-00002');
});

test('fichier corrompu ou étranger : refusé, données existantes intactes', async () => {
  const { db } = await maisonRemplie();
  await expect(restaurerSauvegarde(db, { format: 'autre' })).rejects.toThrow(/pas une sauvegarde/);
  const bonne = JSON.parse(JSON.stringify(await exporterSauvegarde(db)));

  const colonneInjectee = structuredClone(bonne);
  colonneInjectee.tables.logements[0]['reference) VALUES (1); DROP TABLE logements; --'] = 'x';
  await expect(restaurerSauvegarde(db, colonneInjectee)).rejects.toThrow(/Colonne inconnue/);

  const tableInconnue = structuredClone(bonne);
  tableInconnue.tables.sqlite_master = [];
  await expect(restaurerSauvegarde(db, tableInconnue)).rejects.toThrow(/Table inconnue/);

  const incoherente = structuredClone(bonne);
  incoherente.tables.logements = [];
  await expect(restaurerSauvegarde(db, incoherente)).rejects.toThrow(/incohérente/);

  expect((await listerLogements(db)).map((l) => l.reference)).toEqual(['Chambre 1']);
});

test('version de données différente refusée', async () => {
  const { db } = await maisonRemplie();
  const s = JSON.parse(JSON.stringify(await exporterSauvegarde(db)));
  await expect(validerSauvegarde(db, { ...s, schema: 99 })).rejects.toThrow(/autre version/);
});

test('chiffrement : aller-retour, mauvais mot de passe et fichier modifié détectés', async () => {
  const { db } = await maisonRemplie();
  const json = JSON.stringify(await exporterSauvegarde(db));
  await expect(chiffrerSauvegarde(json, '123', aesNode, 10)).rejects.toThrow(/au moins 6/);
  const fichier = await chiffrerSauvegarde(json, 'secret-maison', aesNode, 10);
  expect(estFichierChiffre(fichier)).toBe(true);
  expect(JSON.stringify(fichier)).not.toContain('Moussa');
  expect(await dechiffrerSauvegarde(fichier, 'secret-maison', aesNode)).toBe(json);
  await expect(dechiffrerSauvegarde(fichier, 'mauvais', aesNode)).rejects.toThrow(/incorrect/);
  const octets = depuisBase64(fichier.donnees);
  octets[0] ^= 1;
  await expect(dechiffrerSauvegarde({ ...fichier, donnees: versBase64(octets) }, 'secret-maison', aesNode)).rejects.toThrow(/endommagé/);
});

test('base64 aller-retour', () => {
  for (const n of [0, 1, 2, 3, 31, 100]) {
    const b = randomBytes(n);
    expect(Buffer.from(depuisBase64(versBase64(b))).equals(b)).toBe(true);
    expect(versBase64(b)).toBe(b.toString('base64'));
  }
});

test('réinitialisation : données de gestion effacées, profil et paramètres conservés', async () => {
  const { db } = await maisonRemplie();
  await reinitialiserDonnees(db);
  expect(await listerLogements(db)).toHaveLength(0);
  const p = await db.get<{ nom: string }>('SELECT nom FROM proprietaire');
  expect(p?.nom).toBe('Moussa');
  const n = await db.get<{ n: number }>('SELECT count(*) AS n FROM categories_financieres');
  expect(n?.n).toBeGreaterThan(10);
});

test('client « électricité seule » : conservé par l’export et la restauration', async () => {
  const { db } = await maisonRemplie();
  const { contratId } = await creerClientElectricite(db, { nom_complet: 'Mama', prix_kwh: 250, releve_initial: 100, date_debut: '2026-10-01' });
  const autre = await createMigratedDatabase();
  await restaurerSauvegarde(autre, JSON.parse(JSON.stringify(await exporterSauvegarde(db))));
  expect(await situationElectricite(autre, contratId)).toMatchObject({ type_contrat: 'electricite', locataire_nom: 'Mama', dernier_index: 100 });
  expect((await listerLogements(autre)).map((l) => l.reference)).toEqual(['Chambre 1']);
});

test('sauvegarde d’une version précédente (avant les clients électricité) : restaurée, tout reste en location', async () => {
  const { db, locataireId } = await maisonRemplie();
  const ancienne = JSON.parse(JSON.stringify(await exporterSauvegarde(db)));
  ancienne.schema = 7;
  for (const c of ancienne.tables.contrats) delete c.type;
  for (const l of ancienne.tables.logements) delete l.usage;
  const autre = await createMigratedDatabase();
  await restaurerSauvegarde(autre, ancienne);
  expect(await situationLocataire(autre, locataireId)).toEqual(await situationLocataire(db, locataireId));
  expect(await autre.get('SELECT type FROM contrats')).toEqual({ type: 'bail' });
  expect((await listerLogements(autre)).map((l) => l.reference)).toEqual(['Chambre 1']);
});
