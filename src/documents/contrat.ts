/**
 * Contrat de bail d'habitation (modèle du propriétaire, articles 1 à 12), rempli avec les données réelles.
 * Toutes les valeurs saisies sont échappées ; les images (signatures, pièce) doivent être des « data: ».
 */
import type { SqlDatabase } from '../db/types';
import { dateEcheance, premierMoisFacture } from '../domain/echeances';
import { ErreurMetier } from '../domain/erreurs';
import { formatDate, formatFCFA } from '../domain/format';
import { getBail, type Bail } from '../repositories/bauxRepository';
import { colors } from '../theme/colors';
import { echapper, imageSignature, SYMBOLE } from './gabarits';

export interface DonneesContrat {
  bail: Bail;
  bailleur: { nom: string; adresse: string | null; telephone: string | null; signatureProfil: string | null };
  locataire: { nom: string; telephone: string | null; pieceIdentite: string | null };
  logement: string;
  loyer: number;
  toilettes: number;
  caution: number;
  cautionElectricite: number;
  cautionEau: number;
  jourEcheance: number;
  dateDebut: string;
  dateFin: string | null;
}

export async function donneesContrat(db: SqlDatabase, contratId: number): Promise<DonneesContrat> {
  const c = await db.get<{
    loyer: number;
    toilettes: number;
    caution: number;
    caution_electricite: number;
    caution_eau: number;
    jour_echeance: number;
    date_debut: string;
    date_fin: string | null;
    nom_complet: string;
    telephone: string | null;
    piece_identite: string | null;
    reference: string;
  }>(
    `SELECT c.loyer, c.toilettes, c.caution, c.caution_electricite, c.caution_eau, c.jour_echeance, c.date_debut, c.date_fin, t.nom_complet, t.telephone, t.piece_identite, l.reference
     FROM contrats c JOIN locataires t ON t.id = c.locataire_id JOIN logements l ON l.id = c.logement_id WHERE c.id = ?`,
    [contratId]
  );
  if (!c) throw new ErreurMetier('Contrat introuvable.');
  const p = await db.get<{ nom: string; adresse: string | null; telephone: string | null; signature: string | null }>(
    'SELECT nom, adresse, telephone, signature FROM proprietaire WHERE id = 1'
  );
  return {
    bail: await getBail(db, contratId),
    bailleur: { nom: p?.nom ?? '', adresse: p?.adresse ?? null, telephone: p?.telephone ?? null, signatureProfil: p?.signature ?? null },
    locataire: { nom: c.nom_complet, telephone: c.telephone, pieceIdentite: c.piece_identite },
    logement: c.reference,
    loyer: c.loyer,
    toilettes: c.toilettes,
    caution: c.caution,
    cautionElectricite: c.caution_electricite ?? 0,
    cautionEau: c.caution_eau ?? 0,
    jourEcheance: c.jour_echeance,
    dateDebut: c.date_debut,
    dateFin: c.date_fin,
  };
}

const vide = '<span class="vide">………………</span>';
const v = (valeur: string | number | null | undefined) => (valeur === null || valeur === undefined || valeur === '' ? vide : `<b>${echapper(valeur)}</b>`);
const mois = (n: number) => `${n} mois`;

/** `annexe` : fragment HTML ajouté sur une nouvelle page (fiche d'état des lieux). */
export function htmlContrat(d: DonneesContrat, annexe = ''): string {
  const b = d.bail;
  const [annee, m] = premierMoisFacture(d.dateDebut).split('-').map(Number);
  const premierLoyer = dateEcheance(annee, m, d.jourEcheance, d.dateDebut);
  const moisCaution = d.loyer > 0 ? Math.round((d.caution / d.loyer) * 10) / 10 : 0;
  const signatureBailleur = b.signature_bailleur;
  const piece = b.photo_piece && /^data:image\/(png|jpeg);/.test(b.photo_piece) ? b.photo_piece : null;

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Contrat de bail — ${echapper(d.locataire.nom)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Times New Roman', Georgia, serif; color: #111; margin: 0; padding: 34px 40px; font-size: 13px; line-height: 1.5; }
  h1 { text-align: center; font-size: 22px; text-decoration: underline; margin: 4px 0 18px; letter-spacing: .5px; }
  h2 { font-size: 15px; margin: 16px 0 4px; }
  p { margin: 3px 0; }
  .vide { color: #999; }
  .parties { display: flex; gap: 18px; }
  .partie { flex: 1; border: 1px solid ${colors.border}; border-radius: 8px; padding: 8px 12px; }
  .partie h3 { margin: 0 0 4px; font-size: 13px; text-transform: uppercase; color: ${colors.primary}; }
  ul { margin: 2px 0 0 18px; padding: 0; }
  .signatures { display: flex; justify-content: space-between; margin-top: 18px; gap: 30px; }
  .signature { flex: 1; text-align: center; }
  .cadre { height: 84px; border-bottom: 1px dotted #888; display: flex; align-items: flex-end; justify-content: center; margin: 6px 0; }
  .entete { display: flex; align-items: center; gap: 8px; color: ${colors.muted}; font-family: Arial, sans-serif; font-size: 10px; }
  .annexe { page-break-before: always; }
  .annexe img { max-width: 100%; max-height: 520px; border: 1px solid ${colors.border}; border-radius: 8px; }
  .pied { margin-top: 26px; font-family: Arial, sans-serif; font-size: 10px; color: ${colors.muted}; text-align: center; }
</style></head><body>
<div class="entete">${SYMBOLE.replace(/width="44" height="44"/, 'width="22" height="22"')} Établi avec Onílé</div>
<h1>CONTRAT DE BAIL D’HABITATION</h1>

<h2>Identification des parties</h2>
<div class="parties">
  <div class="partie"><h3>Le Bailleur</h3>
    <p>Nom et prénom : ${v(d.bailleur.nom)}</p><p>Adresse : ${v(d.bailleur.adresse)}</p><p>Téléphone : ${v(d.bailleur.telephone)}</p></div>
  <div class="partie"><h3>Le Locataire</h3>
    <p>Nom et prénom : ${v(d.locataire.nom)}</p><p>Adresse : ${v(b.locataire_adresse)}</p><p>Téléphone : ${v(d.locataire.telephone)}</p>
    ${d.locataire.pieceIdentite ? `<p>Pièce d’identité : ${v(d.locataire.pieceIdentite)}</p>` : ''}</div>
</div>

<h2>Article 1 : Objet du contrat</h2>
<p>Le bailleur donne en location au locataire un logement à usage d’habitation situé à :</p>
<p>Adresse du logement : ${v(b.adresse_logement)} — logement ${v(d.logement)}</p>
<p>Description du logement : nombre de chambres : ${v(b.chambres)} · salon : ${v(b.salon)} · cuisine : ${v(b.cuisine)} · salle de bain : ${v(
    b.salle_de_bain
  )}${b.autres ? ` · autres : ${v(b.autres)}` : ''}</p>

<h2>Article 2 : Durée du bail</h2>
<p>Le présent bail est conclu pour une durée de : ${v(b.duree_annees)} année(s). Il peut être renouvelé par accord entre les parties.</p>

<h2>Article 3 : Loyer</h2>
<p>Le loyer mensuel est fixé à : ${v(formatFCFA(d.loyer))}${d.toilettes > 0 ? `, auquel s’ajoute une contribution aux toilettes de ${v(formatFCFA(d.toilettes))}` : ''}.</p>
<p>Le paiement doit être effectué le ${v(d.jourEcheance)} de chaque mois, le premier loyer étant dû le ${v(formatDate(premierLoyer))}.</p>

<h2>Article 4 : Défaut de paiement du loyer</h2>
<p>Le non‑paiement de ${v(mois(b.mois_impayes))} de loyer constitue un motif de résiliation du présent contrat. Dans ce cas, le propriétaire peut
demander la résiliation pure et simple du bail. Le locataire devra libérer le logement après notification conformément aux dispositions légales.</p>

<h2>Article 5 : Charges</h2>
<p>Les frais de consommation d’eau, d’électricité et les charges courantes d’entretien sont à la charge du locataire.</p>

<h2>Article 6 : Caution</h2>
<p>Le locataire verse une caution de : ${v(formatFCFA(d.caution))}${moisCaution > 0 ? ` (soit ${String(moisCaution).replace('.', ',')} mois de loyer)` : ''}.</p>
${
  d.cautionElectricite || d.cautionEau
    ? `<p>Il verse en outre${d.cautionElectricite ? ` une caution pour l’électricité de ${v(formatFCFA(d.cautionElectricite))}` : ''}${
        d.cautionElectricite && d.cautionEau ? ' et' : ''
      }${d.cautionEau ? ` une caution pour l’eau de ${v(formatFCFA(d.cautionEau))}` : ''}, qui garantissent le paiement de ces consommations.</p>`
    : ''
}
<p>Conformément à la réglementation en vigueur au Bénin, la caution ne peut excéder trois mois de loyer. Elle sera restituée à la fin du bail
après vérification de l’état du logement.</p>

<h2>Article 7 : Résiliation du bail et préavis</h2>
<p>Le présent bail prend effet à compter du : ${v(formatDate(d.dateDebut))}.</p>
<p>Il ne peut être résilié par l’une ou l’autre des parties qu’après un préavis de ${v(mois(b.preavis_mois))} notifié à l’autre partie.
En cas de non‑respect des obligations du locataire ou de non‑paiement du loyer, le propriétaire peut mettre fin au contrat conformément à la loi.</p>

<h2>Article 8 : Obligations du locataire</h2>
<ul><li>Payer régulièrement le loyer.</li><li>Utiliser le logement en bon père de famille.</li><li>Répondre des dégradations causées.</li>
<li>Ne pas modifier les lieux sans l’accord du propriétaire.</li></ul>

<h2>Article 9 : Obligations du bailleur</h2>
<ul><li>Mettre le logement à disposition du locataire.</li><li>Garantir une jouissance paisible du logement.</li>
<li>Effectuer les grosses réparations nécessaires.</li></ul>

<h2>Article 10 : État des lieux</h2>
<p>Le locataire reconnaît avoir visité le logement et l’accepter dans l’état où il se trouve. Un état des lieux pourra être établi lors de
l’entrée et de la sortie.</p>

<h2>Article 11 : Activités interdites</h2>
<p>Le logement est exclusivement destiné à un usage d’habitation. Toute activité commerciale ou illégale est interdite sans autorisation
écrite du propriétaire.</p>

<h2>Article 12 : Signatures</h2>
<p>Fait à : ${v(b.fait_a)} &nbsp; Le : ${v(b.signe_le ? formatDate(b.signe_le) : null)}, en deux exemplaires, un pour chaque partie.</p>
<div class="signatures">
  <div class="signature">Le Bailleur<div class="cadre">${imageSignature(signatureBailleur, 76)}</div>${echapper(d.bailleur.nom)}</div>
  <div class="signature">Le Locataire<div class="cadre">${imageSignature(b.signature_locataire, 76)}</div>${echapper(d.locataire.nom)}</div>
</div>
${
  piece
    ? `<div class="annexe"><h2>Annexe : pièce d’identité du locataire</h2><p>${echapper(d.locataire.nom)}${
        d.locataire.pieceIdentite ? ` — ${echapper(d.locataire.pieceIdentite)}` : ''
      }</p><img src="${echapper(piece)}" alt="Pièce d’identité"></div>`
    : ''
}
${annexe ? `<div class="annexe">${annexe}</div>` : ''}
<div class="pied">Contrat établi avec Onílé — Gérer aujourd’hui, habiter demain.</div>
</body></html>`;
}
