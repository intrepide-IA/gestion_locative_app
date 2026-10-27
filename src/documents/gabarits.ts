/**
 * Gabarits HTML des documents PDF (reçu, facture), aux couleurs Onílé.
 * Toutes les valeurs saisies sont échappées avant insertion (cahier des charges NF-10).
 */
import { formatDate, formatDateHeure, formatFCFA, formatMois } from '../domain/format';
import type { AvisElectricite, CasAvis } from '../domain/electricite';
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
  /** Image « data: » de la signature du bailleur, apposée en bas des documents. */
  signature?: string | null;
}

/** Image de signature : seules les images « data: » enregistrées par l'application sont acceptées. */
export function imageSignature(src: string | null | undefined, hauteur = 70): string {
  if (!src || !/^data:image\/(png|jpeg|svg\+xml);/.test(src)) return '';
  return `<img src="${echapper(src)}" alt="Signature" style="height:${hauteur}px;max-width:240px;object-fit:contain;mix-blend-mode:multiply">`;
}

export interface Destinataire {
  nom: string;
  telephone: string | null;
  logement: string;
  pieceIdentite?: string | null;
  /** Client « électricité seule » : « Client » et « Compteur » au lieu de « Locataire » et « Logement ». */
  clientElectricite?: boolean;
}

export interface DonneesRecu {
  numero: string;
  date: string;
  /** Horodatage de l'enregistrement (ISO), pour l'heure. */
  enregistreLe: string;
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

export const SYMBOLE = `<svg width="44" height="44" viewBox="0 0 512 512" aria-hidden="true">
  <path d="M118 392V214L252 96l134 116v26" fill="none" stroke="${colors.primary}" stroke-width="58" stroke-linecap="round" stroke-linejoin="round"/>
  <g fill="${colors.accent}"><rect x="207" y="194" width="35" height="35" rx="8"/><rect x="250" y="194" width="35" height="35" rx="8"/><rect x="207" y="237" width="35" height="35" rx="8"/><rect x="250" y="237" width="35" height="35" rx="8"/></g>
  <path d="M89 392c86-58 210-92 346-102-26 54-120 92-224 120-44 12-82 26-104 34-18 6-26-8-18-52Z" fill="#17885A"/>
  <path d="M152 458c112-12 214-58 286-130 6 76-42 138-118 156-62 14-122 4-168-26Z" fill="${colors.accent}"/>
</svg>`;

/** Ligne « libellé : valeur » d'un bloc d'identité ; « non renseigné » si la valeur manque. */
function ligne(libelle: string, valeur: string | null | undefined): string {
  return `<div class="ligne"><span>${echapper(libelle)}</span><span>${valeur ? echapper(valeur) : '<i class="muted">non renseigné</i>'}</span></div>`;
}

function page(
  titre: string,
  numero: string,
  corps: string,
  d: { emetteur: Emetteur; destinataire: Destinataire },
  filigrane?: string,
  /** Remplace la ligne « N° … » sous le titre (document non numéroté). */
  ligneNumero?: string
) {
  const e = d.emetteur;
  const t = d.destinataire;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${echapper(titre)} ${echapper(ligneNumero ?? numero)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; color: ${colors.ink}; margin: 0; padding: 36px; font-size: 13px; }
  .entete { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${colors.primary}; padding-bottom: 18px; }
  .marque { display: flex; gap: 10px; align-items: center; }
  .marque b { font-size: 20px; color: ${colors.primary}; display: block; }
  .muted { color: ${colors.muted}; }
  .doc { text-align: right; }
  .doc h1 { margin: 0; font-size: 22px; color: ${colors.primary}; letter-spacing: 1px; }
  .blocs { display: flex; gap: 16px; margin: 22px 0 0; }
  .blocs.details { margin: 12px 0 22px; }
  .bloc .ligne { display: flex; justify-content: space-between; gap: 10px; padding: 2px 0; }
  .bloc .ligne span:first-child { color: ${colors.muted}; }
  .bloc .nom { font-size: 15px; font-weight: 700; display: block; margin-bottom: 4px; }
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
  tr.coupure td { background: #FFF3CF; }
  .filigrane { position: fixed; top: 40%; left: 10%; font-size: 72px; color: rgba(239,68,68,.18); transform: rotate(-25deg); font-weight: 800; }
</style></head><body>
${filigrane ? `<div class="filigrane">${echapper(filigrane)}</div>` : ''}
<div class="entete">
  <div class="marque">${SYMBOLE}<div><b>${echapper(e.nom)}</b><span class="muted">${t.clientElectricite ? 'Vente d’électricité' : 'Location de logements'}</span></div></div>
  <div class="doc"><h1>${echapper(titre)}</h1><div class="muted">${echapper(ligneNumero ?? `N° ${numero}`)}</div></div>
</div>
<div class="blocs">
  <div class="bloc"><h2>${t.clientElectricite ? 'Fournisseur' : 'Propriétaire (bailleur)'}</h2><span class="nom">${echapper(e.nom)}</span>
    ${ligne('Téléphone', e.telephone)}${ligne('Adresse', e.adresse)}</div>
  <div class="bloc"><h2>${t.clientElectricite ? 'Client' : 'Locataire'}</h2><span class="nom">${echapper(t.nom)}</span>
    ${ligne('Téléphone', t.telephone)}${ligne(t.clientElectricite ? 'Compteur' : 'Logement', t.logement)}${
      t.clientElectricite ? '' : ligne('Pièce d’identité', t.pieceIdentite)
    }</div>
</div>
<div class="blocs details">${corps.split('<!--blocs-->')[0]}</div>
${corps.split('<!--blocs-->')[1] ?? ''}
<div style="display:flex;justify-content:flex-end;margin-top:28px"><div style="text-align:center;min-width:220px"><div class="muted">${t.clientElectricite ? 'Le fournisseur' : 'Le bailleur'}</div>
  <div style="height:76px;display:flex;align-items:flex-end;justify-content:center;border-bottom:1px dotted #9CA3AF">${imageSignature(e.signature)}</div>
  <div style="margin-top:4px"><b>${echapper(e.nom)}</b></div></div></div>
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
  const corps = `<div class="bloc"><h2>Paiement</h2>Date : <b>${formatDate(d.date)}</b><br>Enregistré le ${formatDateHeure(d.enregistreLe)}<br>Mode : ${echapper(d.mode)}${
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
  const corps = `<div class="bloc"><h2>Facture</h2>Période : <b>${echapper(moisCapitalise(d.periode.annee, d.periode.mois))}</b><br>Émise le ${formatDateHeure(d.dateEmission)}<br>Échéance : <b>${formatDate(d.dateEcheance)}</b></div><!--blocs-->
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
  /** Horodatage de l'enregistrement (ISO), pour l'heure. */
  enregistreLe: string;
  kwh: number;
  prixKwh: number;
  montantFacture: number;
  montantRecu: number;
  ecart: number;
  /** Index du compteur lu au moment de l'achat (null pour les ventes antérieures à cette information). */
  indexAchat: number | null;
  /** Index auquel le crédit est épuisé : le compteur est coupé à cet index. */
  indexCoupure: number | null;
  mode: string;
  annulee: boolean;
  emetteur: Emetteur;
  destinataire: Destinataire;
}

const formatKwh = (kwh: number) => `${String(kwh).replace('.', ',')} kWh`;
const formatIndex = (index: number) => String(index).replace('.', ',');

export function htmlFactureElectricite(d: DonneesFactureElectricite): string {
  const corps = `<div class="bloc"><h2>Électricité prépayée</h2>Date : <b>${formatDate(d.date)}</b><br>Enregistrée le ${formatDateHeure(d.enregistreLe)}<br>Mode : ${echapper(d.mode)}<br>Statut : ${
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
</table>
${
  d.indexAchat !== null && d.indexCoupure !== null
    ? `<table style="margin-top:22px"><thead><tr><th>Compteur</th><th class="num">Index</th></tr></thead><tbody>
  <tr><td>Index lu au moment de l’achat</td><td class="num">${formatIndex(d.indexAchat)}</td></tr>
  ${
    Math.round((d.indexCoupure - d.indexAchat - d.kwh) * 10) / 10 !== 0
      ? `<tr><td>Crédit restant avant cet achat</td><td class="num">${
          d.indexCoupure - d.indexAchat - d.kwh > 0 ? '+' : '−'
        } ${formatKwh(Math.abs(Math.round((d.indexCoupure - d.indexAchat - d.kwh) * 10) / 10))}</td></tr>`
      : ''
  }
  <tr><td>kWh achetés</td><td class="num">+ ${formatKwh(d.kwh)}</td></tr>
  <tr class="coupure"><td><b>Le crédit expire à l’index</b> (coupure du compteur)</td><td class="num"><b>${formatIndex(d.indexCoupure)}</b></td></tr>
</tbody></table>
<p class="muted" style="margin-top:8px">L’index de coupure tient compte du crédit qui restait avant cet achat.</p>`
    : ''
}`;
  return page('FACTURE', d.numero, corps, d, d.annulee ? 'ANNULÉE' : undefined);
}

export interface DonneesAvisElectricite {
  avis: AvisElectricite;
  /** Date de l'avis (AAAA-MM-JJ). */
  date: string;
  /** Index au moment du dernier achat, pour situer la consommation sur la jauge (si connu). */
  indexDepart: number | null;
  emetteur: Emetteur;
  destinataire: Destinataire;
}

const TONS_AVIS: Record<CasAvis, { fond: string; texte: string; titre: string }> = {
  credit: { fond: colors.primary, texte: '#fff', titre: 'Crédit en cours' },
  bientot: { fond: colors.accent, texte: colors.ink, titre: 'Crédit bientôt épuisé' },
  epuise: { fond: colors.danger, texte: '#fff', titre: 'Crédit épuisé' },
  depasse: { fond: colors.danger, texte: '#fff', titre: 'Consommation sans crédit' },
};

/** Dessin du compteur : écran avec l'index actuel, voyant de la couleur de la situation. */
function dessinCompteur(indexActuel: number, couleur: string): string {
  const chiffres = formatIndex(indexActuel);
  return `<svg width="190" height="230" viewBox="0 0 190 230" role="img" aria-label="Compteur à l’index ${echapper(chiffres)}">
  <rect x="5" y="5" width="180" height="220" rx="18" fill="#F4F1EA" stroke="${colors.ink}" stroke-width="4"/>
  <text x="95" y="38" text-anchor="middle" font-size="13" font-weight="700" fill="${colors.muted}" font-family="Arial">COMPTEUR</text>
  <rect x="22" y="52" width="146" height="58" rx="8" fill="#1F2A24"/>
  <text x="95" y="92" text-anchor="middle" font-size="28" font-weight="700" fill="#9BF2C4" font-family="Courier New, monospace">${echapper(chiffres)}</text>
  <text x="95" y="130" text-anchor="middle" font-size="12" fill="${colors.muted}" font-family="Arial">kWh</text>
  <circle cx="95" cy="168" r="18" fill="${couleur}" stroke="${colors.ink}" stroke-width="3"/>
  <path d="M99 154 86 171h9l-4 13 13-18h-9z" fill="#fff"/>
  <rect x="40" y="200" width="110" height="8" rx="4" fill="${colors.border}"/>
</svg>`;
}

/** Avis au locataire : où en est son compteur, quand il sera coupé, ou ce qu'il doit s'il a dépassé. */
export function htmlAvisElectricite(d: DonneesAvisElectricite): string {
  const a = d.avis;
  const ton = TONS_AVIS[a.cas];
  const depart = d.indexDepart !== null && d.indexDepart < a.indexCoupure ? d.indexDepart : null;
  const enCours = a.cas === 'credit' || a.cas === 'bientot';
  const part = depart === null ? (enCours ? 0.5 : 1) : Math.min(1, Math.max(0, (a.indexActuel - depart) / (a.indexCoupure - depart)));
  const message =
    a.cas === 'depasse'
      ? `Votre crédit s’est terminé à l’index <b>${formatIndex(a.indexCoupure)}</b>. Le compteur affiche <b>${formatIndex(a.indexActuel)}</b> : <b>${formatKwh(
          a.depasseKwh
        )}</b> ont été consommés sans crédit.`
      : a.cas === 'epuise'
        ? `Votre crédit est terminé : le compteur est arrivé à l’index de coupure <b>${formatIndex(a.indexCoupure)}</b>.`
        : `Le compteur affiche <b>${formatIndex(a.indexActuel)}</b>. Votre crédit se termine à l’index <b>${formatIndex(a.indexCoupure)}</b> : il reste <b>${formatKwh(
            a.resteKwh
          )}</b>${a.epuisementEstime ? `, à peu près jusqu’au <b>${formatDate(a.epuisementEstime)}</b>` : ''}.`;
  const fin =
    a.cas === 'depasse'
      ? `<table class="totaux"><tr class="grand"><td>Montant à régler</td><td class="num">${formatFCFA(a.montantDu)}</td></tr>
  <tr><td>Avant le</td><td class="num"><b>${formatDate(a.dateLimite!)}</b></td></tr></table>
<p style="color:${colors.danger};font-weight:700;margin-top:14px">Sans règlement à cette date, le courant sera coupé.</p>`
      : a.cas === 'epuise'
        ? `<p style="color:${colors.danger};font-weight:700;margin-top:14px">Merci de recharger avant le ${formatDate(a.dateLimite!)} : sans recharge, le courant sera coupé.</p>`
        : `<p class="muted" style="margin-top:14px">Pensez à recharger avant l’index de coupure pour ne pas être coupé.</p>`;
  const corps = `<div class="bloc"><h2>Avis d’électricité</h2>Date : <b>${formatDate(d.date)}</b><br>Prix : ${formatFCFA(a.prixKwh)} / kWh</div><!--blocs-->
<div style="display:flex;gap:22px;align-items:center;margin-top:6px">
  ${dessinCompteur(a.indexActuel, ton.fond)}
  <div style="flex:1">
    <div style="background:${ton.fond};color:${ton.texte};border-radius:12px;padding:12px 16px;font-size:18px;font-weight:800">${ton.titre}</div>
    <p style="font-size:14px;line-height:1.55;margin:12px 0">${message}</p>
    <div style="height:16px;border-radius:8px;background:${colors.border};overflow:hidden"><div style="height:16px;width:${Math.round(part * 100)}%;background:${ton.fond}"></div></div>
    <div style="display:flex;justify-content:space-between;font-size:11px;color:${colors.muted};margin-top:4px">
      <span>${depart !== null ? `Dernier achat : ${formatIndex(depart)}` : ''}</span><span>Coupure : ${formatIndex(a.indexCoupure)}</span>
    </div>
  </div>
</div>
<table style="margin-top:20px"><thead><tr><th>Compteur</th><th class="num">Valeur</th></tr></thead><tbody>
  <tr><td>Index actuel</td><td class="num">${formatIndex(a.indexActuel)}</td></tr>
  <tr class="coupure"><td><b>Index de coupure</b> (fin du crédit payé)</td><td class="num"><b>${formatIndex(a.indexCoupure)}</b></td></tr>
  ${a.resteKwh > 0 ? `<tr><td>Crédit restant</td><td class="num">${formatKwh(a.resteKwh)}</td></tr>` : ''}
  ${a.depasseKwh > 0 ? `<tr><td>Consommé sans crédit</td><td class="num">${formatKwh(a.depasseKwh)}</td></tr>` : ''}
</tbody></table>
${fin}`;
  return page('AVIS', '', corps, d, undefined, `Électricité · ${formatDate(d.date)}`);
}
