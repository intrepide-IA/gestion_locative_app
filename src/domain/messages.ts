/**
 * Messages WhatsApp rédigés pour le locataire, à partir des données réelles d'un document.
 * Ton simple et poli, comme un propriétaire qui écrit lui-même.
 */
import type { AvisElectricite } from './electricite';
import { formatDate, formatFCFA, formatMois } from './format';
import { salutation } from './whatsapp';

/** Montant lisible dans WhatsApp (espaces simples plutôt que fines). */
const fcfa = (n: number) => formatFCFA(n).replace(/ /g, ' ');
const kwh = (n: number) => `${String(n).replace('.', ',')} kWh`;
const index = (n: number) => String(n).replace('.', ',');
const signer = (lignes: string[], proprietaire: string) => [...lignes, '', proprietaire].filter((l, i, t) => !(l === '' && t[i - 1] === '')).join('\n');

export function messageRecu(d: {
  nom: string;
  numero: string;
  date: string;
  montant: number;
  mois: { annee: number; mois: number }[];
  /** Part gardée en avance sur les prochains loyers. */
  avance?: number;
  soldeRestant: number;
  proprietaire: string;
}): string {
  const periode = d.mois.length ? ` (loyer ${d.mois.map((m) => formatMois(m.mois, m.annee)).join(', ')})` : '';
  const avance = d.avance && d.avance > 0 ? `${fcfa(d.avance)} sont gardés en avance sur vos prochains loyers.` : '';
  return signer(
    [
      salutation(d.nom),
      `J’ai bien reçu votre paiement de ${fcfa(d.montant)} du ${formatDate(d.date)}${periode}. Merci.`,
      avance,
      d.soldeRestant > 0 ? `Il reste ${fcfa(d.soldeRestant)} à régler.` : 'Vous êtes à jour.',
      `Je vous envoie le reçu n° ${d.numero}.`,
    ].filter(Boolean),
    d.proprietaire
  );
}

export function messageFactureLoyer(d: {
  nom: string;
  numero: string;
  periode: { annee: number; mois: number };
  dateEcheance: string;
  reste: number;
  proprietaire: string;
}): string {
  return signer(
    [
      salutation(d.nom),
      d.reste > 0
        ? `Voici la facture n° ${d.numero} du loyer de ${formatMois(d.periode.mois, d.periode.annee)} : ${fcfa(d.reste)} à régler avant le ${formatDate(d.dateEcheance)}.`
        : `Voici la facture n° ${d.numero} du loyer de ${formatMois(d.periode.mois, d.periode.annee)}. Elle est réglée, merci.`,
    ],
    d.proprietaire
  );
}

export function messageFactureElectricite(d: {
  nom: string;
  numero: string;
  kwh: number;
  montant: number;
  indexCoupure: number | null;
  proprietaire: string;
}): string {
  return signer(
    [
      salutation(d.nom),
      `Votre achat de ${kwh(d.kwh)} d’électricité (${fcfa(d.montant)}) est enregistré.`,
      d.indexCoupure !== null ? `Votre crédit se termine quand le compteur affichera ${index(d.indexCoupure)}.` : '',
      `Je vous envoie la facture n° ${d.numero}.`,
    ].filter(Boolean),
    d.proprietaire
  );
}

export function messageAvisElectricite(a: AvisElectricite, nom: string, proprietaire: string): string {
  const lignes = [salutation(nom)];
  if (a.cas === 'depasse') {
    lignes.push(
      `Votre crédit d’électricité s’est terminé à l’index ${index(a.indexCoupure)}. Votre compteur affiche maintenant ${index(a.indexActuel)}.`,
      `Vous avez donc consommé ${kwh(a.depasseKwh)} sans crédit, soit ${fcfa(a.montantDu)} (${fcfa(a.prixKwh)} le kWh).`,
      `Merci de régler ce montant avant le ${formatDate(a.dateLimite!)}, sinon le courant sera coupé.`
    );
  } else if (a.cas === 'epuise') {
    lignes.push(
      `Votre crédit d’électricité est terminé : le compteur est arrivé à l’index ${index(a.indexCoupure)}.`,
      `Merci de recharger avant le ${formatDate(a.dateLimite!)}, sinon le courant sera coupé.`
    );
  } else {
    lignes.push(
      `Petit point sur votre électricité : le compteur affiche ${index(a.indexActuel)}.`,
      `Votre crédit se termine à l’index ${index(a.indexCoupure)} : il vous reste ${kwh(a.resteKwh)}${
        a.epuisementEstime ? `, à peu près jusqu’au ${formatDate(a.epuisementEstime)}` : ''
      }.`,
      a.cas === 'bientot' ? 'Pensez à recharger bientôt pour ne pas être coupé.' : 'Pensez à recharger avant cet index pour ne pas être coupé.'
    );
  }
  return signer(lignes, proprietaire);
}
