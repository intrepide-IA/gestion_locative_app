/**
 * Sauvegarde et restauration complètes de la base (cahier des charges, section 10).
 * - Export : toutes les tables utiles, format versionné.
 * - Import : validation stricte (format, version, tables et colonnes connues uniquement), résumé, puis
 *   remplacement atomique dans une transaction, contrôle des clés étrangères ; en cas d'échec, rien ne change.
 * Aucun nom de table ou de colonne n'est jamais repris du fichier pour construire du SQL.
 */
import type { SqlDatabase, SqlValue } from '../db/types';
import { SCHEMA_VERSION } from '../db/schema';
import { ErreurMetier } from '../domain/erreurs';

export const FORMAT_SAUVEGARDE = 'onile-sauvegarde';
export const VERSION_FORMAT = 1;

/** Tables sauvegardées, dans l'ordre des dépendances (parents d'abord). */
export const TABLES_SAUVEGARDEES = [
  'proprietaire',
  'logements',
  'locataires',
  'contrats',
  'baux',
  'etats_des_lieux',
  'echeances',
  'paiements',
  'affectations',
  'achats_electricite',
  'releves',
  'sequences',
  'factures',
  'recus',
  'categories_financieres',
  'mouvements_financiers',
  'justificatifs',
  'parametres',
] as const;

type NomTable = (typeof TABLES_SAUVEGARDEES)[number];
type Ligne = Record<string, SqlValue>;

export interface Sauvegarde {
  format: typeof FORMAT_SAUVEGARDE;
  version: number;
  schema: number;
  exportee_le: string;
  tables: Record<NomTable, Ligne[]>;
}

export interface ResumeSauvegarde {
  exportee_le: string;
  proprietaire: string | null;
  logements: number;
  locataires: number;
  paiements: number;
  factures: number;
  mouvements: number;
}

async function colonnes(db: SqlDatabase, table: NomTable): Promise<string[]> {
  return (await db.all<{ name: string }>(`PRAGMA table_info(${table})`)).map((c) => c.name);
}

export async function exporterSauvegarde(db: SqlDatabase, maintenant = new Date().toISOString()): Promise<Sauvegarde> {
  const tables = {} as Record<NomTable, Ligne[]>;
  for (const t of TABLES_SAUVEGARDEES) tables[t] = await db.all<Ligne>(`SELECT * FROM ${t}`);
  return { format: FORMAT_SAUVEGARDE, version: VERSION_FORMAT, schema: SCHEMA_VERSION, exportee_le: maintenant, tables };
}

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Vérifie la structure d'une sauvegarde lue dans un fichier ; lève une ErreurMetier explicite sinon. */
export async function validerSauvegarde(db: SqlDatabase, brut: unknown): Promise<{ sauvegarde: Sauvegarde; resume: ResumeSauvegarde }> {
  if (!estObjet(brut) || brut.format !== FORMAT_SAUVEGARDE) throw new ErreurMetier('Ce fichier n’est pas une sauvegarde Onílé.');
  if (brut.version !== VERSION_FORMAT) throw new ErreurMetier('Version de sauvegarde non prise en charge.');
  // Une sauvegarde d'une version antérieure reste restaurable : les tables apparues depuis sont vides.
  if (typeof brut.schema !== 'number' || brut.schema < 1 || brut.schema > SCHEMA_VERSION) {
    throw new ErreurMetier(`Sauvegarde créée avec une autre version de l’application (données v${String(brut.schema)}, application v${SCHEMA_VERSION}).`);
  }
  if (typeof brut.exportee_le !== 'string' || !estObjet(brut.tables)) throw new ErreurMetier('Sauvegarde incomplète.');
  for (const nom of Object.keys(brut.tables)) {
    if (!(TABLES_SAUVEGARDEES as readonly string[]).includes(nom)) throw new ErreurMetier(`Table inconnue dans la sauvegarde : ${nom}.`);
  }
  for (const t of TABLES_SAUVEGARDEES) {
    if (brut.tables[t] === undefined && (brut.schema as number) < SCHEMA_VERSION) brut.tables[t] = [];
    const lignes = brut.tables[t];
    if (!Array.isArray(lignes)) throw new ErreurMetier(`Table manquante dans la sauvegarde : ${t}.`);
    const autorisees = new Set(await colonnes(db, t));
    for (const ligne of lignes) {
      if (!estObjet(ligne)) throw new ErreurMetier(`Ligne invalide dans ${t}.`);
      for (const [col, valeur] of Object.entries(ligne)) {
        if (!autorisees.has(col)) throw new ErreurMetier(`Colonne inconnue dans ${t} : ${col}.`);
        if (valeur !== null && typeof valeur !== 'string' && typeof valeur !== 'number') {
          throw new ErreurMetier(`Valeur invalide dans ${t}.${col}.`);
        }
      }
    }
  }
  const s = brut as unknown as Sauvegarde;
  const nom = s.tables.proprietaire[0]?.nom;
  return {
    sauvegarde: s,
    resume: {
      exportee_le: s.exportee_le,
      proprietaire: typeof nom === 'string' ? nom : null,
      logements: s.tables.logements.length,
      locataires: s.tables.locataires.length,
      paiements: s.tables.paiements.length,
      factures: s.tables.factures.length,
      mouvements: s.tables.mouvements_financiers.length,
    },
  };
}

/**
 * Remplace toutes les données par celles de la sauvegarde, en une seule transaction.
 * Les colonnes insérées sont celles du schéma de l'application (jamais celles du fichier).
 */
export async function restaurerSauvegarde(db: SqlDatabase, brut: unknown): Promise<ResumeSauvegarde> {
  const { sauvegarde, resume } = await validerSauvegarde(db, brut);
  await db.transaction(async (tx) => {
    // Contrôle des clés étrangères reporté à la fin de la transaction (ordre d'insertion libre).
    await tx.exec('PRAGMA defer_foreign_keys = ON');
    for (const t of [...TABLES_SAUVEGARDEES].reverse()) await tx.run(`DELETE FROM ${t}`);
    await tx.run('DELETE FROM notifications_programmees');
    for (const t of TABLES_SAUVEGARDEES) {
      const cols = await colonnes(tx, t);
      for (const ligne of sauvegarde.tables[t]) {
        const presentes = cols.filter((c) => c in ligne);
        if (!presentes.length) continue;
        await tx.run(
          `INSERT INTO ${t} (${presentes.join(', ')}) VALUES (${presentes.map(() => '?').join(', ')})`,
          presentes.map((c) => ligne[c] ?? null)
        );
      }
    }
    const incoherences = await tx.all('PRAGMA foreign_key_check');
    if (incoherences.length) throw new ErreurMetier('Sauvegarde incohérente (références manquantes) : restauration annulée.');
  });
  return resume;
}

/**
 * Efface toutes les données de gestion (logements, locataires, loyers, électricité, finances).
 * Conserve le profil, le PIN, les paramètres et les catégories. Action irréversible : PIN exigé par l'écran.
 */
export async function reinitialiserDonnees(db: SqlDatabase): Promise<void> {
  await db.transaction(async (tx) => {
    for (const t of [
      'justificatifs',
      'mouvements_financiers',
      'recus',
      'factures',
      'affectations',
      'paiements',
      'echeances',
      'releves',
      'achats_electricite',
      'baux',
      'etats_des_lieux',
      'contrats',
      'locataires',
      'logements',
      'sequences',
      'notifications_programmees',
    ]) {
      await tx.run(`DELETE FROM ${t}`);
    }
    await tx.run('UPDATE proprietaire SET solde_initial = 0');
  });
}
