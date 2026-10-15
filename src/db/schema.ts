/**
 * Migrations du schéma SQLite. Chaque entrée fait passer `PRAGMA user_version` de `version - 1` à `version`.
 * Ne jamais modifier une migration publiée : en ajouter une nouvelle.
 *
 * Conventions : montants en entiers FCFA, dates en texte ISO 8601, booléens 0/1.
 */
export interface Migration {
  version: number;
  description: string;
  sql: string;
}

const MODES_PAIEMENT = "('especes', 'mobile_money', 'virement', 'autre')";

const V1 = `
CREATE TABLE proprietaire (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  nom TEXT NOT NULL,
  telephone TEXT,
  adresse TEXT,
  logo_uri TEXT,
  solde_initial INTEGER NOT NULL DEFAULT 0,
  cree_le TEXT NOT NULL
);

CREATE TABLE logements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT NOT NULL UNIQUE COLLATE NOCASE,
  type TEXT NOT NULL CHECK (type IN ('entree_couchee', 'chambre_salon', 'autre')),
  description TEXT,
  loyer_indicatif INTEGER NOT NULL CHECK (loyer_indicatif >= 0),
  toilettes INTEGER NOT NULL DEFAULT 0 CHECK (toilettes >= 0),
  archive INTEGER NOT NULL DEFAULT 0 CHECK (archive IN (0, 1)),
  cree_le TEXT NOT NULL
);

CREATE TABLE locataires (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom_complet TEXT NOT NULL CHECK (length(trim(nom_complet)) > 0),
  telephone TEXT,
  piece_identite TEXT,
  notes TEXT,
  statut TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'contrat_termine', 'parti')),
  archive INTEGER NOT NULL DEFAULT 0 CHECK (archive IN (0, 1)),
  cree_le TEXT NOT NULL
);

CREATE TABLE contrats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  locataire_id INTEGER NOT NULL REFERENCES locataires (id) ON DELETE RESTRICT,
  logement_id INTEGER NOT NULL REFERENCES logements (id) ON DELETE RESTRICT,
  date_debut TEXT NOT NULL,
  date_fin TEXT,
  date_sortie TEXT,
  loyer INTEGER NOT NULL CHECK (loyer >= 0),
  toilettes INTEGER NOT NULL DEFAULT 0 CHECK (toilettes >= 0),
  caution INTEGER NOT NULL DEFAULT 0 CHECK (caution >= 0),
  prix_kwh INTEGER NOT NULL DEFAULT 250 CHECK (prix_kwh > 0),
  releve_initial REAL NOT NULL DEFAULT 0 CHECK (releve_initial >= 0),
  jour_echeance INTEGER NOT NULL DEFAULT 5 CHECK (jour_echeance BETWEEN 1 AND 28),
  statut TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'termine')),
  cree_le TEXT NOT NULL,
  CHECK (date_fin IS NULL OR date_fin >= date_debut)
);
-- Un logement et un locataire n'ont jamais plus d'un contrat actif.
CREATE UNIQUE INDEX contrats_un_actif_par_logement ON contrats (logement_id) WHERE statut = 'actif';
CREATE UNIQUE INDEX contrats_un_actif_par_locataire ON contrats (locataire_id) WHERE statut = 'actif';

CREATE TABLE echeances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contrat_id INTEGER NOT NULL REFERENCES contrats (id) ON DELETE RESTRICT,
  annee INTEGER NOT NULL,
  mois INTEGER NOT NULL CHECK (mois BETWEEN 1 AND 12),
  loyer INTEGER NOT NULL CHECK (loyer >= 0),
  toilettes INTEGER NOT NULL CHECK (toilettes >= 0),
  montant_du INTEGER NOT NULL CHECK (montant_du = loyer + toilettes),
  date_echeance TEXT NOT NULL,
  cree_le TEXT NOT NULL,
  UNIQUE (contrat_id, annee, mois)
);

CREATE TABLE paiements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  locataire_id INTEGER NOT NULL REFERENCES locataires (id) ON DELETE RESTRICT,
  date_paiement TEXT NOT NULL,
  montant INTEGER NOT NULL CHECK (montant > 0),
  mode TEXT NOT NULL CHECK (mode IN ${MODES_PAIEMENT}),
  reference TEXT,
  note TEXT,
  annule_le TEXT,
  motif_annulation TEXT,
  cree_le TEXT NOT NULL,
  CHECK (annule_le IS NULL OR motif_annulation IS NOT NULL)
);

-- Part d'un paiement imputée à une échéance. La part non imputée d'un paiement forme le crédit du locataire.
CREATE TABLE affectations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paiement_id INTEGER NOT NULL REFERENCES paiements (id) ON DELETE RESTRICT,
  echeance_id INTEGER NOT NULL REFERENCES echeances (id) ON DELETE RESTRICT,
  montant INTEGER NOT NULL CHECK (montant > 0),
  cree_le TEXT NOT NULL
);
CREATE INDEX affectations_echeance ON affectations (echeance_id);
CREATE INDEX affectations_paiement ON affectations (paiement_id);

CREATE TRIGGER affectations_pas_plus_que_le_paiement
BEFORE INSERT ON affectations
WHEN (SELECT montant FROM paiements WHERE id = NEW.paiement_id)
     < NEW.montant + (SELECT COALESCE(SUM(montant), 0) FROM affectations WHERE paiement_id = NEW.paiement_id)
BEGIN
  SELECT RAISE(ABORT, 'affectation_superieure_au_paiement');
END;

CREATE TABLE achats_electricite (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contrat_id INTEGER NOT NULL REFERENCES contrats (id) ON DELETE RESTRICT,
  date_achat TEXT NOT NULL,
  montant_recu INTEGER NOT NULL CHECK (montant_recu > 0),
  prix_kwh INTEGER NOT NULL CHECK (prix_kwh > 0),
  kwh REAL NOT NULL CHECK (kwh > 0),
  montant_facture INTEGER NOT NULL CHECK (montant_facture > 0),
  ecart_arrondi INTEGER NOT NULL CHECK (ecart_arrondi = montant_recu - montant_facture),
  mode TEXT NOT NULL CHECK (mode IN ${MODES_PAIEMENT}),
  annule_le TEXT,
  motif_annulation TEXT,
  cree_le TEXT NOT NULL
);

CREATE TABLE releves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contrat_id INTEGER NOT NULL REFERENCES contrats (id) ON DELETE RESTRICT,
  compteur TEXT NOT NULL CHECK (compteur IN ('electricite', 'eau')),
  date_releve TEXT NOT NULL,
  ancien_index REAL NOT NULL CHECK (ancien_index >= 0),
  nouvel_index REAL NOT NULL CHECK (nouvel_index >= 0),
  consommation REAL NOT NULL CHECK (consommation = nouvel_index - ancien_index),
  motif_correction TEXT,
  cree_le TEXT NOT NULL,
  -- Un index qui recule n'est admis qu'avec un motif (changement de compteur).
  CHECK (nouvel_index >= ancien_index OR motif_correction IS NOT NULL)
);
CREATE INDEX releves_contrat ON releves (contrat_id, compteur, date_releve);

-- Numéros de documents : une séquence par type et par année.
CREATE TABLE sequences (
  type TEXT NOT NULL CHECK (type IN ('FAC', 'REC', 'DEP')),
  annee INTEGER NOT NULL,
  dernier_numero INTEGER NOT NULL CHECK (dernier_numero >= 0),
  PRIMARY KEY (type, annee)
);

CREATE TABLE factures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('loyer', 'electricite', 'eau', 'autre')),
  locataire_id INTEGER NOT NULL REFERENCES locataires (id) ON DELETE RESTRICT,
  echeance_id INTEGER REFERENCES echeances (id) ON DELETE RESTRICT,
  achat_electricite_id INTEGER REFERENCES achats_electricite (id) ON DELETE RESTRICT,
  montant INTEGER NOT NULL CHECK (montant >= 0),
  statut TEXT NOT NULL DEFAULT 'emise' CHECK (statut IN ('emise', 'annulee')),
  motif_annulation TEXT,
  cree_le TEXT NOT NULL
);
CREATE INDEX factures_locataire ON factures (locataire_id);

CREATE TABLE recus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE,
  paiement_id INTEGER NOT NULL UNIQUE REFERENCES paiements (id) ON DELETE RESTRICT,
  montant INTEGER NOT NULL CHECK (montant > 0),
  solde_restant INTEGER NOT NULL,
  cree_le TEXT NOT NULL
);

CREATE TABLE categories_financieres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  sens TEXT NOT NULL CHECK (sens IN ('entree', 'sortie')),
  code TEXT UNIQUE,
  archive INTEGER NOT NULL DEFAULT 0 CHECK (archive IN (0, 1)),
  UNIQUE (nom, sens)
);

CREATE TABLE mouvements_financiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT UNIQUE,
  date_operation TEXT NOT NULL,
  sens TEXT NOT NULL CHECK (sens IN ('entree', 'sortie')),
  montant INTEGER NOT NULL CHECK (montant > 0),
  categorie_id INTEGER NOT NULL REFERENCES categories_financieres (id) ON DELETE RESTRICT,
  mode TEXT CHECK (mode IN ${MODES_PAIEMENT}),
  description TEXT,
  beneficiaire TEXT,
  logement_id INTEGER REFERENCES logements (id) ON DELETE RESTRICT,
  origine_type TEXT CHECK (origine_type IN ('paiement', 'achat_electricite', 'caution')),
  origine_id INTEGER,
  statut TEXT NOT NULL DEFAULT 'valide' CHECK (statut IN ('brouillon', 'valide', 'annule')),
  motif_annulation TEXT,
  cree_le TEXT NOT NULL,
  -- Une opération d'origine ne produit qu'un seul mouvement : pas de double comptage.
  UNIQUE (origine_type, origine_id)
);
CREATE INDEX mouvements_date ON mouvements_financiers (date_operation);

CREATE TABLE justificatifs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mouvement_id INTEGER NOT NULL REFERENCES mouvements_financiers (id) ON DELETE RESTRICT,
  uri TEXT NOT NULL,
  cree_le TEXT NOT NULL
);

-- Une notification par type et par événement : empêche les rappels en double.
CREATE TABLE notifications_programmees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  cle_evenement TEXT NOT NULL,
  identifiant_systeme TEXT,
  prevue_le TEXT NOT NULL,
  UNIQUE (type, cle_evenement)
);

CREATE TABLE parametres (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL
);

INSERT INTO parametres (cle, valeur) VALUES
  ('jour_echeance_defaut', '5'),
  ('prix_kwh_defaut', '250'),
  ('seuil_kwh_bas', '5'),
  ('delai_verrouillage_secondes', '120');

INSERT INTO categories_financieres (nom, sens, code) VALUES
  ('Loyers', 'entree', 'loyer'),
  ('Contributions toilettes', 'entree', 'toilettes'),
  ('Cautions reçues', 'entree', 'caution'),
  ('Ventes d''électricité', 'entree', 'electricite'),
  ('Paiements d''eau', 'entree', 'eau'),
  ('Remboursements reçus', 'entree', NULL),
  ('Autres revenus', 'entree', NULL),
  ('Réparations', 'sortie', NULL),
  ('Entretien', 'sortie', NULL),
  ('Achat de matériel', 'sortie', NULL),
  ('Facture d''électricité', 'sortie', NULL),
  ('Facture d''eau', 'sortie', NULL),
  ('Plomberie', 'sortie', NULL),
  ('Travaux d''électricité', 'sortie', NULL),
  ('Nettoyage', 'sortie', NULL),
  ('Restitution de caution', 'sortie', 'restitution_caution'),
  ('Autres charges', 'sortie', NULL);
`;

/**
 * V2 : contrat de bail numérique (modèle du propriétaire, articles 1 à 12) et signatures.
 * Les signatures et la photo de la pièce d'identité sont des images « data: » (base chiffrée, sauvegardées).
 */
const V2 = `
ALTER TABLE proprietaire ADD COLUMN signature TEXT;

CREATE TABLE baux (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contrat_id INTEGER NOT NULL UNIQUE REFERENCES contrats (id) ON DELETE RESTRICT,
  adresse_logement TEXT,
  chambres INTEGER CHECK (chambres IS NULL OR chambres >= 0),
  salon INTEGER CHECK (salon IS NULL OR salon >= 0),
  cuisine INTEGER CHECK (cuisine IS NULL OR cuisine >= 0),
  salle_de_bain INTEGER CHECK (salle_de_bain IS NULL OR salle_de_bain >= 0),
  autres TEXT,
  locataire_adresse TEXT,
  duree_annees INTEGER NOT NULL DEFAULT 1 CHECK (duree_annees > 0),
  preavis_mois INTEGER NOT NULL DEFAULT 1 CHECK (preavis_mois >= 0),
  mois_impayes INTEGER NOT NULL DEFAULT 3 CHECK (mois_impayes > 0),
  fait_a TEXT,
  signature_bailleur TEXT,
  signature_locataire TEXT,
  photo_piece TEXT,
  signe_le TEXT,
  cree_le TEXT NOT NULL,
  modifie_le TEXT
);
`;

/** V3 : état des lieux d'entrée et de sortie (modèle du propriétaire), signé par les deux parties. */
const V3 = `
CREATE TABLE etats_des_lieux (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contrat_id INTEGER NOT NULL REFERENCES contrats (id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('entree', 'sortie')),
  date_etat TEXT NOT NULL,
  -- JSON : [{ "element": "Mur", "etat": "bon" | "moyen" | "mauvais" | null }]
  elements TEXT NOT NULL,
  observations TEXT,
  signature_bailleur TEXT,
  signature_locataire TEXT,
  signe_le TEXT,
  cree_le TEXT NOT NULL,
  modifie_le TEXT,
  UNIQUE (contrat_id, type)
);
`;

/**
 * V4 : décompte de la caution au départ. La caution est un fonds de garantie, jamais un loyer :
 * au départ, on en retient les loyers impayés et les réparations, et on rend le reste.
 */
const V4 = `
ALTER TABLE contrats ADD COLUMN caution_retenue_impayes INTEGER NOT NULL DEFAULT 0 CHECK (caution_retenue_impayes >= 0);
ALTER TABLE contrats ADD COLUMN caution_retenue_reparations INTEGER NOT NULL DEFAULT 0 CHECK (caution_retenue_reparations >= 0);
ALTER TABLE contrats ADD COLUMN motif_retenue TEXT;
ALTER TABLE contrats ADD COLUMN caution_rendue INTEGER NOT NULL DEFAULT 0 CHECK (caution_rendue >= 0);
`;

/** V5 : index du compteur au moment de la vente et index de coupure, imprimés sur la facture d'électricité. */
const V5 = `
ALTER TABLE achats_electricite ADD COLUMN index_achat REAL;
ALTER TABLE achats_electricite ADD COLUMN index_coupure REAL;
`;

/**
 * V6 : cautions séparées. Certains propriétaires prennent, en plus de la caution de loyer, une caution
 * pour l'électricité et une pour l'eau. Elles forment ensemble le fonds de garantie du contrat.
 */
const V6 = `
ALTER TABLE contrats ADD COLUMN caution_electricite INTEGER NOT NULL DEFAULT 0 CHECK (caution_electricite >= 0);
ALTER TABLE contrats ADD COLUMN caution_eau INTEGER NOT NULL DEFAULT 0 CHECK (caution_eau >= 0);
ALTER TABLE contrats ADD COLUMN caution_retenue_charges INTEGER NOT NULL DEFAULT 0 CHECK (caution_retenue_charges >= 0);
ALTER TABLE contrats ADD COLUMN motif_retenue_charges TEXT;
`;

/** V7 : journal des corrections sensibles (motif obligatoire), jamais effacé. */
const V7 = `
CREATE TABLE journal_modifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quand TEXT NOT NULL,
  objet TEXT NOT NULL,
  objet_id INTEGER,
  action TEXT NOT NULL,
  motif TEXT NOT NULL CHECK (length(trim(motif)) > 0),
  details TEXT
);
`;

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, description: 'Schéma initial Onílé', sql: V1 },
  { version: 2, description: 'Contrat de bail numérique et signatures', sql: V2 },
  { version: 3, description: 'État des lieux d’entrée et de sortie', sql: V3 },
  { version: 4, description: 'Décompte de la caution au départ', sql: V4 },
  { version: 5, description: 'Index du compteur sur les ventes d’électricité', sql: V5 },
  { version: 6, description: 'Cautions électricité et eau', sql: V6 },
  { version: 7, description: 'Journal des corrections', sql: V7 },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;
