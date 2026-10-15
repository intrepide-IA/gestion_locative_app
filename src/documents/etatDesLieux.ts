/**
 * Fiche d'état des lieux (entrée / sortie) d'après le modèle du propriétaire : une ligne par élément,
 * colonnes Bon / Moyen / Mauvais à l'entrée et à la sortie, observations et signatures.
 */
import type { SqlDatabase } from '../db/types';
import { ErreurMetier } from '../domain/erreurs';
import { formatDate } from '../domain/format';
import { degradations, getEtatDesLieux, LIBELLES_NOTE, type EtatDesLieux, type Note } from '../repositories/etatDesLieuxRepository';
import { colors } from '../theme/colors';
import { echapper, imageSignature, SYMBOLE } from './gabarits';

export interface DonneesEtatDesLieux {
  adresse: string | null;
  logement: string;
  locataire: string;
  proprietaire: string;
  dateEntree: string;
  entree: EtatDesLieux | null;
  sortie: EtatDesLieux | null;
}

export async function donneesEtatDesLieux(db: SqlDatabase, contratId: number, jour: string): Promise<DonneesEtatDesLieux> {
  const c = await db.get<{ date_debut: string; nom_complet: string; reference: string; adresse: string | null; proprietaire: string | null }>(
    `SELECT c.date_debut, t.nom_complet, l.reference, COALESCE(b.adresse_logement, p.adresse) AS adresse, p.nom AS proprietaire
     FROM contrats c JOIN locataires t ON t.id = c.locataire_id JOIN logements l ON l.id = c.logement_id
     LEFT JOIN baux b ON b.contrat_id = c.id LEFT JOIN proprietaire p ON p.id = 1 WHERE c.id = ?`,
    [contratId]
  );
  if (!c) throw new ErreurMetier('Contrat introuvable.');
  const [entree, sortie] = await Promise.all([getEtatDesLieux(db, contratId, 'entree', jour), getEtatDesLieux(db, contratId, 'sortie', jour)]);
  return {
    adresse: c.adresse,
    logement: c.reference,
    locataire: c.nom_complet,
    proprietaire: c.proprietaire ?? '',
    dateEntree: c.date_debut,
    entree: entree.enregistre ? entree : null,
    sortie: sortie.enregistre ? sortie : null,
  };
}

const NOTES: Note[] = ['bon', 'moyen', 'mauvais'];
const case_ = (coche: boolean) => `<span class="case${coche ? ' cochee' : ''}">${coche ? '✔' : ''}</span>`;

function signatures(titre: string, e: EtatDesLieux, d: DonneesEtatDesLieux): string {
  return `<div class="sig-bloc"><h3>${echapper(titre)} — ${formatDate(e.date_etat)}</h3>
  ${e.observations ? `<p><b>Observations :</b> ${echapper(e.observations)}</p>` : ''}
  <div class="signatures">
    <div>Signature du propriétaire<div class="cadre">${imageSignature(e.signature_bailleur, 60)}</div>${echapper(d.proprietaire)}</div>
    <div>Signature du locataire<div class="cadre">${imageSignature(e.signature_locataire, 60)}</div>${echapper(d.locataire)}</div>
  </div></div>`;
}

export function htmlEtatDesLieux(d: DonneesEtatDesLieux): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>État des lieux — ${echapper(d.locataire)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Times New Roman', Georgia, serif; color: #111; margin: 0; padding: 30px 36px; font-size: 12.5px; }
</style></head><body>${sectionEtatDesLieux(d)}</body></html>`;
}

/** Fiche seule (styles limités à .edl), pour l'annexer à un autre document comme le contrat de bail. */
export function sectionEtatDesLieux(d: DonneesEtatDesLieux): string {
  const noms: string[] = [];
  for (const l of [...(d.entree?.elements ?? []), ...(d.sortie?.elements ?? [])]) if (!noms.includes(l.element)) noms.push(l.element);
  const note = (e: EtatDesLieux | null, element: string) => e?.elements.find((l) => l.element === element)?.etat ?? null;
  const pertes = d.entree && d.sortie ? degradations(d.entree.elements, d.sortie.elements) : [];
  const abime = new Set(pertes.map((p) => p.element));
  const lignes = noms
    .map((n) => {
      const a = note(d.entree, n);
      const s = note(d.sortie, n);
      return `<tr${abime.has(n) ? ' class="abime"' : ''}><td class="el">${echapper(n)}</td>${NOTES.map((x) => `<td>${case_(a === x)}</td>`).join('')}${NOTES.map(
        (x) => `<td>${case_(s === x)}</td>`
      ).join('')}</tr>`;
    })
    .join('');
  return `<style>
  .edl h1 { text-align: center; font-size: 17px; text-decoration: underline; margin: 6px 0 16px; }
  .edl .entete { display: flex; align-items: center; gap: 8px; color: ${colors.muted}; font-family: Arial, sans-serif; font-size: 10px; }
  .edl .infos p { margin: 3px 0; }
  .edl table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  .edl th, .edl td { border: 1px solid #999; padding: 3px 4px; text-align: center; }
  .edl th { background: #f2f2f2; font-style: italic; font-weight: normal; font-size: 11.5px; }
  .edl td.el { text-align: right; font-style: italic; padding-right: 8px; }
  .edl tbody tr:nth-child(even) td { background: #fafafa; }
  .edl tr.abime td { background: #fde8e8 !important; }
  .edl .case { display: inline-block; width: 13px; height: 13px; border: 1px solid #333; line-height: 12px; font-size: 11px; }
  .edl .case.cochee { background: ${colors.primary}; color: #fff; border-color: ${colors.primary}; }
  .edl .sig-bloc { margin-top: 16px; page-break-inside: avoid; }
  .edl .sig-bloc h3 { font-size: 13px; margin: 0 0 4px; }
  .edl .signatures { display: flex; gap: 30px; text-align: center; }
  .edl .signatures > div { flex: 1; }
  .edl .cadre { height: 66px; border-bottom: 1px dotted #888; display: flex; align-items: flex-end; justify-content: center; margin: 4px 0; }
  .edl .degradations { margin-top: 14px; padding: 8px 12px; border: 1px solid #f5b5b5; background: #fff6f6; border-radius: 6px; }
  .edl .pied { margin-top: 20px; font-family: Arial, sans-serif; font-size: 10px; color: ${colors.muted}; text-align: center; }
</style><div class="edl">
<div class="entete">${SYMBOLE.replace(/width="44" height="44"/, 'width="22" height="22"')} Établi avec Onílé</div>
<h1>FICHE D’ÉTAT DES LIEUX (ENTRÉE / SORTIE)</h1>
<div class="infos">
  <p>Adresse du logement : <b>${echapper(d.adresse ?? '')}</b> — <b>${echapper(d.logement)}</b></p>
  <p>Nom du locataire : <b>${echapper(d.locataire)}</b></p>
  <p>Nom du propriétaire : <b>${echapper(d.proprietaire)}</b></p>
  <p>Date d’entrée : <b>${formatDate(d.entree?.date_etat ?? d.dateEntree)}</b> &nbsp;&nbsp; Date de sortie : <b>${
    d.sortie ? formatDate(d.sortie.date_etat) : '……………………'
  }</b></p>
</div>
<table>
  <thead><tr><th>Élément</th>${NOTES.map((n) => `<th>Entrée ${LIBELLES_NOTE[n]}</th>`).join('')}${NOTES.map((n) => `<th>Sortie ${LIBELLES_NOTE[n]}</th>`).join('')}</tr></thead>
  <tbody>${lignes}</tbody>
</table>
${
  pertes.length
    ? `<div class="degradations"><b>Dégradations constatées à la sortie :</b> ${pertes
        .map((p) => `${echapper(p.element)} (${LIBELLES_NOTE[p.avant].toLowerCase()} → ${LIBELLES_NOTE[p.apres].toLowerCase()})`)
        .join(', ')}</div>`
    : ''
}
${d.entree ? signatures('État des lieux d’entrée', d.entree, d) : ''}
${d.sortie ? signatures('État des lieux de sortie', d.sortie, d) : ''}
<div class="pied">État des lieux établi avec Onílé — Gérer aujourd’hui, habiter demain.</div>
</div>`;
}
