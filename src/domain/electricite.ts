/** Règles de l'électricité prépayée (cahier des charges, section 7). */

/** Arrondi à 0,1 kWh près. */
export const arrondiKwh = (kwh: number) => Math.round(kwh * 10) / 10;

export interface CalculAchat {
  kwh: number;
  /** Montant réellement facturé : kWh retenus × prix. */
  montantFacture: number;
  /** Différence entre le montant reçu et le montant facturé (à rendre au locataire). */
  ecart: number;
}

/**
 * kWh = montant ÷ prix, arrondi à 0,1 kWh **inférieur** (on ne vend jamais plus que ce qui est payé) ;
 * le montant facturé est recalculé, et l'écart d'arrondi est rendu explicite, jamais perdu.
 */
export function calculerAchat(montantRecu: number, prixKwh: number): CalculAchat {
  const kwh = Math.floor((montantRecu / prixKwh) * 10 + 1e-9) / 10;
  const montantFacture = Math.round(kwh * prixKwh);
  return { kwh, montantFacture, ecart: montantRecu - montantFacture };
}

export type EtatStock = 'ok' | 'bas' | 'epuise' | 'deficit';

export function etatStock(stock: number, seuilBas: number): EtatStock {
  if (stock < 0) return 'deficit';
  if (stock === 0) return 'epuise';
  if (stock < seuilBas) return 'bas';
  return 'ok';
}

export const LIBELLES_STOCK: Record<EtatStock, string> = {
  ok: 'Stock suffisant',
  bas: 'Stock bas',
  epuise: 'Stock épuisé',
  deficit: 'Déficit',
};

/** Nombre de jours entre deux dates AAAA-MM-JJ. */
const jours = (de: string, a: string) =>
  Math.round((Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10)) - Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10))) / 86_400_000);

const ajouterJours = (jour: string, n: number) => {
  const d = new Date(Date.UTC(+jour.slice(0, 4), +jour.slice(5, 7) - 1, +jour.slice(8, 10) + n));
  return d.toISOString().slice(0, 10);
};

export interface Estimation {
  /** Consommation moyenne observée (kWh par jour), ou null tant qu'aucun relevé ne la mesure. */
  kwhParJour: number | null;
  /** Jour où le crédit devrait être épuisé (compteur à l'index de coupure), ou null si inconnu. */
  epuisement: string | null;
}

/**
 * Estime quand le compteur atteindra l'index de coupure, d'après la consommation moyenne relevée
 * depuis l'entrée : stock restant ÷ kWh par jour, compté à partir du dernier relevé.
 */
export function estimerEpuisement(e: { stock: number; consommes: number; dateDebut: string; dernierReleve: string | null }): Estimation {
  if (!e.dernierReleve || e.consommes <= 0) return { kwhParJour: null, epuisement: null };
  const duree = Math.max(1, jours(e.dateDebut, e.dernierReleve));
  const kwhParJour = e.consommes / duree;
  if (e.stock <= 0) return { kwhParJour, epuisement: e.dernierReleve };
  return { kwhParJour, epuisement: ajouterJours(e.dernierReleve, Math.floor(e.stock / kwhParJour)) };
}

export { ajouterJours };
