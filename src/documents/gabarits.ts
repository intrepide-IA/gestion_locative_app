/**
 * Gabarits HTML des documents PDF (reçu, facture), aux couleurs Onílé.
 * Toutes les valeurs saisies sont échappées avant insertion (cahier des charges NF-10).
 */
import { formatDate, formatFCFA, formatMois } from '../domain/format';
import { colors } from '../theme/colors';

export function echapper(valeur: unknown): string {
  return String(valeur ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface Emetteur {
  nom: string;
  telephone: string | null;
  adresse: string | null;
}

export interface Destinataire {
  nom: string;
  telephone: string | null;
  logement: string;
}

export interface DonneesRecu {
  numero: string;
  date: string;
  montant: number;
  mode: string;
  reference: string | null;
  /** Échéances réglées par ce paiement. */
  lignes: { annee: number; mois: number; montant: number }[];
  /** Part non affectée, conservée en crédit. */
  credit: number;
  /** Reste dû par le locataire après ce paiement. */
  soldeRestant: number;
  annule: { le: string; motif: string } | null;
  emetteur: Emetteur;
  destinataire: Destinataire;
}

export interface DonneesFacture {
  numero: string;
  dateEmission: string;
  periode: { annee: number; mois: number };
  dateEcheance: string;
  loyer: number;
  toilettes: number;
  montant: number;
  regle: number;
  annulee: boolean;
  emetteur: Emetteur;
  destinataire: Destinataire;
}

const SYMBOLE = `<svg width="44" height="44" viewBox="0 0 512 512" aria-hidden="true">
  <path d="M118 392V214L252 96l134 116v26" fill="none" stroke="${colors.primary}" stroke-width="58" stroke-linecap="round" stroke-linejoin="round"/>
  <g fill="${colors.accent}"><rect x="207" y="194" width="35" height="35" rx="8"/><rect x="250" y="194" width="35" height="35" rx="8"/><rect x="207" y="237" width="35" height="35" rx="8"/><rect x="250" y="237" width="35" height="35" rx="8"/></g>
  <path d="M89 392c86-58 210-92 346-102-26 54-120 92-224 120-44 12-82 26-104 34-18 6-26-8-18-52Z" fill="#17885A"/>
  <path d="M152 458c112-12 214-58 286-130 6 76-42 138-118 156-62 14-122 4-168-26Z" fill="${colors.accent}"/>
</svg>`;

function page(titre: string, numero: string, corps: string, d: { emetteur: Emetteur; destinataire: Destinataire }, filigrane?: string) {
  const e = d.emetteur;
  const t = d.destinataire;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${echapper(titre)} ${echapper(numero)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; color: ${colors.ink}; margin: 0; padding: 36px; font-size: 13px; }
  .entete { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${colors.primary}; padding-bottom: 18px; }
  .marque { display: flex; gap: 10px; align-items: center; }
  .marque b { font-size: 20px; color: ${colors.primary}; display: block; }
  .muted { color: ${colors.muted}; }
  .doc { text-align: right; }
  .doc h1 { margin: 0; font-size: 22px; color: ${colors.primary}; letter-spacing: 1px; }
  .blocs { display: flex; gap: 16px; margin: 22px 0; }
  .bloc { flex: 1; background: ${colors.background}; border-radius: 10px; padding: 12px 14px; }
  .bloc h2 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; color: ${colors.muted}; letter-spacing: .5px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { text-align: left; background: ${colors.primary}; color: #fff; padding: 9px 10px; font-size: 12px; }
  td { padding: 9px 10px; border-bottom: 1px solid ${colors.border}; }
  .num { text-align: right; white-space: nowrap; }
  .totaux { margin-left: auto; width: 60%; margin-top: 14px; }
  .totaux td { border: none; padding: 5px 10px; }
  .grand td { font-size: 16px; font-weight: 700; color: ${colors.primary}; border-top: 2px solid ${colors.primary}; }
  .pied { margin-top: 36px; padding-top: 12px; border-top: 1px solid ${colors.border}; font-size: 11px; color: ${colors.muted}; text-align: center; }
  .filigrane { position: fixed; top: 40%; left: 10%; font-size: 72px; color: rgba(239,68,68,.18); transform: rotate(-25deg); font-weight: 800; }
</style></head><body>
${filigrane ? `<div class="filigrane">${echapper(filigrane)}</div>` : ''}
<div class="entete">
  <div class="marque">${SYMBOLE}<div><b>${echapper(e.nom)}</b>
    ${e.telephone ? `<span class="muted">${echapper(e.telephone)}</span><br>` : ''}
    ${e.adresse ? `<span class="muted">${echapper(e.adresse)}</span>` : ''}</div></div>
  <div class="doc"><h1>${echapper(titre)}</h1><div class="muted">N° ${echapper(numero)}</div></div>
</div>
<div class="blocs">
  <div class="bloc"><h2>Locataire</h2><b>${echapper(t.nom)}</b><br>${t.telephone ? `${echapper(t.telephone)}<br>` : ''}Logement : ${echapper(t.logement)}</div>
  ${corps.split('<!--blocs-->')[0]}
</div>
${corps.split('<!--blocs-->')[1] ?? ''}
<div class="pied">Document établi avec Onílé — Gérer aujourd’hui, habiter demain.</div>
</body></html>`;
}

const moisCapitalise = (annee: number, mois: number) => {
  const m = formatMois(mois, annee);
  return m.charAt(0).toUpperCase() + m.slice(1);
};

export function htmlRecu(d: DonneesRecu): string {
  const lignes = d.lignes.length
    ? d.lignes.map((l) => `<tr><td>Loyer ${echapper(moisCapitalise(l.annee, l.mois))}</td><td class="num">${formatFCFA(l.montant)}</td></tr>`).join('')
    : '';
  const credit = d.credit > 0 ? `<tr><td>Avance conservée en crédit</td><td class="num">${formatFCFA(d.credit)}</td></tr>` : '';
  const corps = `<div class="bloc"><h2>Paiement</h2>Date : <b>${formatDate(d.date)}</b><br>Mode : ${echapper(d.mode)}${
    d.reference ? `<br>Référence : ${echapper(d.reference)}` : ''
  }</div><!--blocs-->
<table><thead><tr><th>Objet</th><th class="num">Montant</th></tr></thead><tbody>${lignes}${credit}</tbody></table>
<table class="totaux">
  <tr class="grand"><td>Montant reçu</td><td class="num">${formatFCFA(d.montant)}</td></tr>
  <tr><td>Reste à payer après ce paiement</td><td class="num">${formatFCFA(d.soldeRestant)}</td></tr>
</table>
${d.annule ? `<p style="color:${colors.danger};margin-top:18px"><b>Paiement annulé le ${formatDate(d.annule.le)}</b> — motif : ${echapper(d.annule.motif)}</p>` : ''}`;
  return page('REÇU', d.numero, corps, d, d.annule ? 'ANNULÉ' : undefined);
}

export function htmlFacture(d: DonneesFacture): string {
  const reste = Math.max(0, d.montant - d.regle);
  const statut = reste === 0 ? 'Réglée' : d.regle > 0 ? 'Partiellement réglée' : 'À régler';
  const corps = `<div class="bloc"><h2>Facture</h2>Période : <b>${echapper(moisCapitalise(d.periode.annee, d.periode.mois))}</b><br>Émise le ${formatDate(
    d.dateEmission
  )}<br>Échéance : <b>${formatDate(d.dateEcheance)}</b></div><!--blocs-->
<table><thead><tr><th>Désignation</th><th class="num">Montant</th></tr></thead><tbody>
  <tr><td>Loyer</td><td class="num">${formatFCFA(d.loyer)}</td></tr>
  ${d.toilettes > 0 ? `<tr><td>Contribution toilettes</td><td class="num">${formatFCFA(d.toilettes)}</td></tr>` : ''}
</tbody></table>
<table class="totaux">
  <tr class="grand"><td>Total dû</td><td class="num">${formatFCFA(d.montant)}</td></tr>
  <tr><td>Déjà réglé</td><td class="num">${formatFCFA(d.regle)}</td></tr>
  <tr><td><b>Reste à payer</b></td><td class="num"><b>${formatFCFA(reste)}</b></td></tr>
  <tr><td>Statut</td><td class="num">${statut}</td></tr>
</table>`;
  return page('FACTURE', d.numero, corps, d, d.annulee ? 'ANNULÉE' : undefined);
}

export interface DonneesFactureElectricite {
  numero: string;
  date: string;
  kwh: number;
  prixKwh: number;
  montantFacture: number;
  montantRecu: number;
  ecart: number;
  mode: string;
  annulee: boolean;
  emetteur: Emetteur;
  destinataire: Destinataire;
}

const formatKwh = (kwh: number) => `${String(kwh).replace('.', ',')} kWh`;

export function htmlFactureElectricite(d: DonneesFactureElectricite): string {
  const corps = `<div class="bloc"><h2>Électricité prépayée</h2>Date : <b>${formatDate(d.date)}</b><br>Mode : ${echapper(d.mode)}<br>Statut : ${
    d.annulee ? 'Annulée' : 'Payée'
  }</div><!--blocs-->
<table><thead><tr><th>Désignation</th><th class="num">Quantité</th><th class="num">Prix unitaire</th><th class="num">Montant</th></tr></thead><tbody>
  <tr><td>Électricité prépayée</td><td class="num">${formatKwh(d.kwh)}</td><td class="num">${formatFCFA(d.prixKwh)} / kWh</td><td class="num">${formatFCFA(
    d.montantFacture
  )}</td></tr>
</tbody></table>
<table class="totaux">
  <tr class="grand"><td>Total facturé</td><td class="num">${formatFCFA(d.montantFacture)}</td></tr>
  <tr><td>Montant reçu</td><td class="num">${formatFCFA(d.montantRecu)}</td></tr>
  ${d.ecart > 0 ? `<tr><td>Rendu (arrondi à 0,1 kWh)</td><td class="num">${formatFCFA(d.ecart)}</td></tr>` : ''}
</table>`;
  return page('FACTURE', d.numero, corps, d, d.annulee ? 'ANNULÉE' : undefined);
}
