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
