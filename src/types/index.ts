/** Types pour l'application Gestion Locative */

export type TypeLogement = 'entree_couchee' | 'chambre_salon';
export type StatutLogement = 'libre' | 'occupe';
export type StatutLocataire = 'actif' | 'contrat_echu' | 'parti';
export type StatutPaiement = 'paye' | 'partiel' | 'retard';
export type StatutFacture = 'en_attente' | 'paye' | 'annule';
export type TypeFacture = 'loyer' | 'electricite' | 'combine';

export interface Proprietaire {
  id?: number;
  nom: string;
  telephone: string;
  adresse: string;
  logo_uri?: string;
  created_at: string;
}

export interface Logement {
  id?: number;
  type: TypeLogement;
  numero: string;
  loyer_mensuel: number;
  toilettes_mensuel: number;
  statut: StatutLogement;
  created_at: string;
}

export interface Locataire {
  id?: number;
  nom_complet: string;
  telephone: string;
  piece_identite?: string;
  date_entree: string;
  caution: number;
  logement_id: number;
  statut: StatutLocataire;
  notes?: string;
  releve_compteur_initial?: number;
  created_at: string;
}

export interface Contrat {
  id?: number;
  locataire_id: number;
  date_debut: string;
  date_fin: string;
  montant_loyer: number;
  montant_toilettes: number;
  prix_kwh: number;
  signature_uri?: string;
  created_at: string;
}

export interface PaiementLoyer {
  id?: number;
  locataire_id: number;
  mois: number;
  annee: number;
  montant_du: number;
  montant_paye: number;
  statut: StatutPaiement;
  date_paiement?: string;
  facture_id?: number;
  notes?: string;
  solde_avant?: number;
  solde_apres?: number;
}

export interface ElectriciteStock {
  id?: number;
  locataire_id: number;
  kwh_achete: number;
  montant_paye: number;
  kwh_restant: number;
  date_achat: string;
}

export interface ConsommationElectricite {
  id?: number;
  locataire_id: number;
  ancien_compteur: number;
  nouveau_compteur: number;
  consommation: number;
  date_releve: string;
}

export interface Facture {
  id?: number;
  numero_unique: string;
  type: TypeFacture;
  locataire_id: number;
  montant_total: number;
  pdf_uri?: string;
  statut: StatutFacture;
  mois?: number;
  annee?: number;
  kwh_consommes?: number;
  created_at: string;
}

export interface MouvementCompte {
  id?: number;
  locataire_id: number;
  date_operation: string;
  libelle: string;
  montant: number;
  solde_avant: number;
  solde_apres: number;
}

export const PRIX_KWH_DEFAUT = 250;
export const TOILETTES_DEFAUT = 1000;
