/**
 * Livre de tenue : document relié en PDF (couverture, sommaire, synthèse, irrégularités, chambres,
 * paiements, électricité, finances) et même contenu en classeur Excel.
 */
import { formatDate, formatFCFA, formatMois } from '../domain/format';
import type { ChambreLivre, LivreDeTenue } from '../repositories/livreRepository';
import { colors } from '../theme/colors';
import { echapper as e, SYMBOLE } from './gabarits';
import { classeurXlsx, type Feuille } from './tableur';

const F = (n: number) => formatFCFA(n);
const moisCourt = (annee: number, mois: number) => {
  const m = formatMois(mois, annee);
  return m.charAt(0).toUpperCase() + m.slice(1);
};
const kwh = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')} kWh`;

const SITUATION: Record<ChambreLivre['situation'], [string, string, string]> = {
  ok: ['À jour', '#E7F4EC', '#1E7A46'],
  attention: ['À surveiller', '#FFF4D6', '#8A6500'],
  retard: ['En retard', '#FDECEA', colors.danger],
  libre: ['Libre', '#F3F4F6', colors.muted],
};
const STATUT: Record<string, string> = { Payé: '#1E7A46', Partiel: '#8A6500', Impayé: colors.danger, 'À venir': colors.muted };

const pastille = (s: ChambreLivre['situation']) =>
  `<span class="pastille" style="background:${SITUATION[s][1]};color:${SITUATION[s][2]}">${SITUATION[s][0]}</span>`;

function tableau(entetes: (string | [string, 'num'])[], lignes: string[][], total?: string[]): string {
  if (!lignes.length) return '<p class="vide">Rien à afficher pour cette période.</p>';
  const th = entetes.map((t) => (Array.isArray(t) ? `<th class="num">${e(t[0])}</th>` : `<th>${e(t)}</th>`)).join('');
  const nums = entetes.map((t) => Array.isArray(t));
  const ligne = (l: string[], cls = '') => `<tr class="${cls}">${l.map((c, i) => `<td class="${nums[i] ? 'num' : ''}">${c}</td>`).join('')}</tr>`;
  return `<table><thead><tr>${th}</tr></thead><tbody>${lignes.map((l) => ligne(l)).join('')}${total ? ligne(total, 'total') : ''}</tbody></table>`;
}

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** Barres « attendu / encaissé » par mois, en SVG (s'imprime net). */
function graphique(parMois: LivreDeTenue['parMois']): string {
  if (!parMois.length) return '';
  const max = Math.max(1, ...parMois.map((m) => Math.max(m.attendu, m.encaisse)));
  const largeur = 640;
  const hauteur = 170;
  const pas = largeur / parMois.length;
  const barre = Math.min(18, pas / 3);
  const barres = parMois
    .map((m, i) => {
      const x = i * pas + pas / 2;
      const ha = (m.attendu / max) * (hauteur - 30);
      const he = (m.encaisse / max) * (hauteur - 30);
      const etiquette = `${MOIS_COURTS[m.mois - 1]}${parMois.length > 12 || m.mois === 1 ? ` ${String(m.annee).slice(2)}` : ''}`;
      return `<rect x="${x - barre - 1}" y="${hauteur - 20 - ha}" width="${barre}" height="${ha}" rx="3" fill="#CFE3DA"/>
<rect x="${x + 1}" y="${hauteur - 20 - he}" width="${barre}" height="${he}" rx="3" fill="${colors.primary}"/>
<text x="${x}" y="${hauteur - 5}" font-size="10" text-anchor="middle" fill="${colors.muted}">${e(etiquette)}</text>`;
    })
    .join('');
  return `<svg width="100%" viewBox="0 0 ${largeur} ${hauteur}" class="graphique">${barres}<line x1="0" x2="${largeur}" y1="${hauteur - 20}" y2="${hauteur - 20}" stroke="${colors.border}"/></svg>
<div class="legende"><span><i style="background:#CFE3DA"></i>Loyers attendus</span><span><i style="background:${colors.primary}"></i>Encaissé</span></div>`;
}

function ficheChambre(c: ChambreLivre): string {
  const occupants = tableau(
    ['Locataire', 'Téléphone', 'Entrée', 'Sortie', ['Loyer', 'num'], ['Caution', 'num']],
    c.occupants.map((o) => [
      `<b>${e(o.nom)}</b>${o.statut === 'actif' ? ' <span class="muted">(actuel)</span>' : ''}`,
      e(o.telephone ?? '—'),
      formatDate(o.date_debut),
      o.date_sortie ? formatDate(o.date_sortie) : o.statut === 'actif' ? '—' : formatDate(o.date_fin ?? o.date_debut),
      F(o.loyer),
      F(o.caution),
    ])
  );
  const echeancier = tableau(
    ['Mois', 'Locataire', 'Échéance', ['Dû', 'num'], ['Payé', 'num'], ['Reste', 'num'], 'Statut'],
    c.echeances.map((x) => [
      moisCourt(x.annee, x.mois),
      e(x.locataire),
      formatDate(x.date_echeance),
      F(x.du),
      F(x.paye),
      x.reste ? `<b>${F(x.reste)}</b>` : '—',
      `<b style="color:${STATUT[x.statut]}">${x.statut}</b>`,
    ]),
    c.echeances.length ? ['<b>Total</b>', '', '', `<b>${F(c.totalDu)}</b>`, `<b>${F(c.totalPaye)}</b>`, `<b>${F(c.impaye)}</b>`, ''] : undefined
  );
  const paiements = tableau(
    ['Date', 'Locataire', 'Mode', 'Mois réglés', ['Montant', 'num']],
    c.paiements.map((p) => [
      formatDate(p.date),
      e(p.locataire),
      `${e(p.mode)}${p.reference ? ` <span class="muted">· ${e(p.reference)}</span>` : ''}`,
      e(p.periodes.map((x) => moisCourt(x.annee, x.mois)).join(', ') || 'Crédit'),
      F(p.montant),
    ])
  );
  return `<div class="chambre">
<div class="titre-chambre"><h3>${e(c.reference)}</h3><span class="muted">${e(c.type)} · loyer ${F(c.loyer_indicatif)}${c.archive ? ' · archivé' : ''}</span>${pastille(c.situation)}</div>
<h4>Occupants sur la période</h4>${c.occupants.length ? occupants : '<p class="vide">Chambre libre sur toute la période.</p>'}
<h4>Échéancier des loyers</h4>${echeancier}
<h4>Paiements reçus</h4>${paiements}
</div>`;
}

export function htmlLivre(l: LivreDeTenue): string {
  const s = l.synthese;
  const p = l.periode;
  const tuile = (libelle: string, valeur: string, note = '', ton: string = colors.ink) =>
    `<div class="tuile"><span>${e(libelle)}</span><b style="color:${ton}">${valeur}</b>${note ? `<small>${note}</small>` : ''}</div>`;
  const sections = [
    'Synthèse de la période',
    'Situations irrégulières',
    'Vue d’ensemble des chambres',
    'Fiche de chaque chambre',
    'Journal des paiements',
    'Électricité',
    'Recettes et dépenses',
  ];
  const titre = (n: number) => `<h2><span>${n + 1}</span>${e(sections[n])}</h2>`;

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Livre de tenue — ${e(l.maison)} — ${e(p.libelle)}</title>
<style>
  @page { size: A4 portrait; margin: 16mm 14mm 18mm; @bottom-center { content: "${e(l.maison)} · Livre de tenue · page " counter(page) " / " counter(pages); font-size: 9px; color: ${colors.muted}; } }
  @page :first { @bottom-center { content: none; } }
  * { box-sizing: border-box; }
  body { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; color: ${colors.ink}; margin: 0; font-size: 11.5px; line-height: 1.45; }
  /* Page de garde : pleine page A4, sans marges, positions fixes (rendu identique à l'impression). */
  @page :first { margin: 0; }
  .couverture { position: relative; width: 210mm; height: 296mm; overflow: hidden; page-break-after: always; background: #fff; }
  .couverture .bandeau { position: absolute; left: 0; top: 0; right: 0; height: 132mm; background: ${colors.primary}; overflow: hidden; }
  .couverture .rond { position: absolute; border-radius: 50%; }
  .couverture .logo { position: absolute; left: 20mm; top: 20mm; width: 22mm; height: 22mm; background: #fff; border-radius: 6mm; display: flex; align-items: center; justify-content: center; }
  .couverture .marque { position: absolute; left: 46mm; top: 23mm; color: #fff; font-size: 17px; font-weight: 800; letter-spacing: .5px; }
  .couverture .marque small { display: block; font-size: 10px; font-weight: 500; opacity: .8; letter-spacing: 0; margin-top: 2px; }
  .couverture .titres { position: absolute; left: 20mm; right: 20mm; top: 62mm; color: #fff; }
  .couverture .sur { font-size: 11px; letter-spacing: 3.5px; text-transform: uppercase; opacity: .85; }
  .couverture h1 { margin: 4mm 0 0; font-size: 40px; line-height: 1.08; font-weight: 800; }
  .couverture .periode { margin-top: 5mm; display: inline-block; background: ${colors.accent}; color: #3D2E00; font-weight: 700; font-size: 13px; padding: 2mm 4mm; border-radius: 2mm; }
  .couverture .corps { position: absolute; left: 20mm; right: 20mm; top: 148mm; }
  .couverture .intro { font-size: 13px; color: ${colors.ink}; max-width: 150mm; line-height: 1.55; margin: 0 0 9mm; }
  .couverture .chiffres { display: flex; gap: 5mm; margin-bottom: 11mm; }
  .couverture .chiffre { flex: 1; border: 1px solid ${colors.border}; border-top: 3px solid ${colors.primary}; border-radius: 2.5mm; padding: 4mm 4.5mm; }
  .couverture .chiffre span { display: block; font-size: 10px; color: ${colors.muted}; text-transform: uppercase; letter-spacing: .6px; }
  .couverture .chiffre b { display: block; font-size: 20px; margin-top: 1.5mm; color: ${colors.ink}; }
  .couverture .fiche { display: flex; gap: 10mm; }
  .couverture .fiche > div { flex: 1; }
  .couverture .fiche h5 { margin: 0 0 2.5mm; font-size: 10px; text-transform: uppercase; letter-spacing: .8px; color: ${colors.primary}; border-bottom: 1px solid ${colors.border}; padding-bottom: 1.5mm; }
  .couverture .fiche p { margin: 0 0 1.4mm; font-size: 12px; display: flex; justify-content: space-between; gap: 4mm; }
  .couverture .fiche p span { color: ${colors.muted}; }
  .couverture .fiche p b { text-align: right; font-weight: 600; }
  .couverture .pied-garde { position: absolute; left: 20mm; right: 20mm; bottom: 14mm; border-top: 1px solid ${colors.border}; padding-top: 4mm; display: flex; justify-content: space-between; font-size: 10px; color: ${colors.muted}; }
  .saut { page-break-before: always; }
  .sommaire li { display: flex; justify-content: space-between; padding: 9px 0; border-bottom: 1px dotted ${colors.border}; font-size: 13px; }
  .sommaire ol { list-style: none; padding: 0; margin: 18px 0 0; counter-reset: s; }
  h2 { font-size: 19px; color: ${colors.primary}; margin: 0 0 14px; display: flex; align-items: center; gap: 10px; }
  h2 span { background: ${colors.primary}; color: #fff; border-radius: 8px; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; font-size: 14px; }
  h3 { margin: 0; font-size: 16px; }
  h4 { margin: 14px 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: .5px; color: ${colors.muted}; }
  .muted { color: ${colors.muted}; }
  .tuiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px; }
  .tuile { background: ${colors.background}; border-radius: 10px; padding: 10px 12px; }
  .tuile span { display: block; color: ${colors.muted}; font-size: 10.5px; }
  .tuile b { display: block; font-size: 15px; margin-top: 2px; }
  .tuile small { color: ${colors.muted}; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; page-break-inside: auto; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th { text-align: left; background: ${colors.primary}; color: #fff; padding: 6px 8px; font-size: 10.5px; font-weight: 600; }
  td { padding: 6px 8px; border-bottom: 1px solid ${colors.border}; vertical-align: top; }
  tr:nth-child(even) td { background: #FAFBFA; }
  tr.total td { background: #EEF4F1; border-top: 2px solid ${colors.primary}; }
  .num { text-align: right; white-space: nowrap; }
  .vide { color: ${colors.muted}; font-style: italic; margin: 4px 0 10px; }
  .pastille { border-radius: 999px; padding: 2px 9px; font-size: 10.5px; font-weight: 700; white-space: nowrap; }
  .chambre { page-break-inside: auto; margin-bottom: 26px; padding-top: 6px; }
  .chambre + .chambre { page-break-before: always; }
  .titre-chambre { display: flex; align-items: center; gap: 10px; border-bottom: 2px solid ${colors.primary}; padding-bottom: 8px; }
  .titre-chambre .muted { flex: 1; }
  .graphique { margin: 4px 0; }
  .legende { display: flex; gap: 18px; color: ${colors.muted}; font-size: 10.5px; margin-bottom: 14px; }
  .legende i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }
  .encadre { background: #E7F4EC; color: #1E7A46; border-radius: 10px; padding: 12px 14px; font-weight: 600; }
  .pied { margin-top: 24px; text-align: center; color: ${colors.muted}; font-size: 10px; }
</style></head><body>

<section class="couverture">
  <div class="bandeau">
    <div class="rond" style="width:120mm;height:120mm;right:-38mm;top:-46mm;background:rgba(255,255,255,.06)"></div>
    <div class="rond" style="width:70mm;height:70mm;right:22mm;bottom:-34mm;background:rgba(244,183,40,.16)"></div>
    <div class="logo">${SYMBOLE.replace('width="44" height="44"', 'width="64" height="64"')}</div>
    <div class="marque">Onílé<small>Gérer aujourd’hui, habiter demain</small></div>
    <div class="titres">
      <div class="sur">Livre de tenue de la maison</div>
      <h1>${e(l.maison)}</h1>
      <div class="periode">${e(p.libelle)} · du ${formatDate(p.debut)} au ${formatDate(p.fin)}</div>
    </div>
  </div>
  <div class="corps">
    <p class="intro">Ce livre retrace la gestion de la maison sur la période : les loyers et les paiements chambre par chambre, les occupants, les situations à régulariser, l’électricité, les recettes et les dépenses.</p>
    <div class="chiffres">
      <div class="chiffre"><span>Loyers encaissés</span><b>${F(s.loyersEncaisses)}</b></div>
      <div class="chiffre"><span>Recouvrement</span><b>${s.tauxRecouvrement} %</b></div>
      <div class="chiffre"><span>Chambres occupées</span><b>${s.occupees} / ${s.chambres}</b></div>
    </div>
    <div class="fiche">
      <div><h5>Propriétaire</h5>
        <p><span>Nom</span><b>${e(l.proprietaire.nom || '—')}</b></p>
        <p><span>Téléphone</span><b>${e(l.proprietaire.telephone || '—')}</b></p>
        <p><span>Adresse</span><b>${e(l.proprietaire.adresse || '—')}</b></p>
      </div>
      <div><h5>Document</h5>
        <p><span>Période</span><b>${e(p.libelle)}</b></p>
        <p><span>Locataires actifs</span><b>${s.locatairesActifs}</b></p>
        <p><span>Paiements reçus</span><b>${l.paiements.length}</b></p>
        <p><span>Établi le</span><b>${formatDate(l.genereLe)}</b></p>
      </div>
    </div>
  </div>
  <div class="pied-garde"><span>Document établi avec Onílé</span><span>Usage du propriétaire · confidentiel</span></div>
</section>

<section class="sommaire"><h2>Sommaire</h2><ol>${sections
    .map((t, i) => `<li><span><b style="color:${colors.primary}">${i + 1}.</b> ${e(t)}</span><span class="muted">${i === 3 ? `${l.chambres.length} chambre(s)` : ''}</span></li>`)
    .join('')}</ol></section>

<section class="saut">${titre(0)}
<div class="tuiles">
${tuile('Chambres', String(s.chambres), `${s.occupees} occupée(s)`)}
${tuile('Locataires actifs', String(s.locatairesActifs))}
${tuile('Loyers attendus', F(s.loyersAttendus), 'échéances passées')}
${tuile('Loyers encaissés', F(s.loyersEncaisses), '', colors.primary)}
${tuile('Taux de recouvrement', `${s.tauxRecouvrement} %`, '', s.tauxRecouvrement >= 90 ? '#1E7A46' : s.tauxRecouvrement >= 70 ? '#8A6500' : colors.danger)}
${tuile('Impayés aujourd’hui', F(s.impayesAujourdhui), '', s.impayesAujourdhui ? colors.danger : '#1E7A46')}
${tuile('Électricité vendue', F(s.electriciteMontant), kwh(s.electriciteKwh))}
${tuile('Trésorerie', F(s.soldeFin), `début : ${F(s.soldeDebut)}`)}
</div>
<h4>Loyers attendus et encaissés, mois par mois</h4>
${graphique(l.parMois)}
${tableau(
  ['Mois', ['Attendu', 'num'], ['Encaissé', 'num'], ['Écart', 'num'], ['Dépenses', 'num']],
  l.parMois.map((m) => [moisCourt(m.annee, m.mois), F(m.attendu), F(m.encaisse), F(m.encaisse - m.attendu), F(m.depenses)]),
  [
    '<b>Total</b>',
    `<b>${F(l.parMois.reduce((t, m) => t + m.attendu, 0))}</b>`,
    `<b>${F(l.parMois.reduce((t, m) => t + m.encaisse, 0))}</b>`,
    `<b>${F(l.parMois.reduce((t, m) => t + m.encaisse - m.attendu, 0))}</b>`,
    `<b>${F(l.parMois.reduce((t, m) => t + m.depenses, 0))}</b>`,
  ]
)}
</section>

<section class="saut">${titre(1)}
${
  l.irregularites.length
    ? tableau(
        ['Chambre', 'Locataire / client', 'Nature', 'Détail', ['Montant dû', 'num']],
        l.irregularites.map((i) => [`<b>${e(i.chambre)}</b>`, e(i.locataire), `<b style="color:${colors.danger}">${e(i.nature)}</b>`, e(i.detail), i.montant ? F(i.montant) : '—']),
        ['<b>Total</b>', '', '', '', `<b>${F(l.irregularites.reduce((t, i) => t + i.montant, 0))}</b>`]
      )
    : '<div class="encadre">Aucune situation irrégulière à ce jour : tous les loyers et l’électricité sont à jour.</div>'
}
</section>

<section class="saut">${titre(2)}
${tableau(
  ['Chambre', 'Type', 'Occupant actuel', ['Dû', 'num'], ['Payé', 'num'], ['Impayé', 'num'], 'Situation'],
  l.chambres.map((c) => [
    `<b>${e(c.reference)}</b>`,
    e(c.type),
    e(c.occupants.find((o) => o.statut === 'actif')?.nom ?? '—'),
    F(c.totalDu),
    F(c.totalPaye),
    c.impaye ? `<b style="color:${colors.danger}">${F(c.impaye)}</b>` : '—',
    pastille(c.situation),
  ]),
  [
    '<b>Total</b>',
    '',
    '',
    `<b>${F(l.chambres.reduce((t, c) => t + c.totalDu, 0))}</b>`,
    `<b>${F(l.chambres.reduce((t, c) => t + c.totalPaye, 0))}</b>`,
    `<b>${F(l.chambres.reduce((t, c) => t + c.impaye, 0))}</b>`,
    '',
  ]
)}
</section>

<section class="saut">${titre(3)}
${l.chambres.map(ficheChambre).join('') || '<p class="vide">Aucune chambre.</p>'}
</section>

<section class="saut">${titre(4)}
${tableau(
  ['Date', 'Chambre', 'Locataire', 'Mode', 'Mois réglés', ['Montant', 'num']],
  l.paiements.map((x) => [
    formatDate(x.date),
    e(x.chambre),
    e(x.locataire),
    `${e(x.mode)}${x.reference ? ` <span class="muted">· ${e(x.reference)}</span>` : ''}`,
    e(x.periodes.map((m) => moisCourt(m.annee, m.mois)).join(', ') || 'Crédit'),
    F(x.montant),
  ]),
  ['<b>Total</b>', '', '', '', `${l.paiements.length} paiement(s)`, `<b>${F(l.paiements.reduce((t, x) => t + x.montant, 0))}</b>`]
)}
</section>

<section class="saut">${titre(5)}
${tableau(
  ['Date', 'Chambre / compteur', 'Client', 'Mode', ['kWh', 'num'], ['Montant', 'num']],
  l.electricite.map((a) => [formatDate(a.date), e(a.chambre), e(a.client), e(a.mode), kwh(a.kwh), F(a.montant)]),
  ['<b>Total</b>', '', '', '', `<b>${kwh(s.electriciteKwh)}</b>`, `<b>${F(s.electriciteMontant)}</b>`]
)}
</section>

<section class="saut">${titre(6)}
<div class="tuiles">${tuile('Recettes', F(s.entrees), '', '#1E7A46')}${tuile('Dépenses', F(s.sorties), '', colors.danger)}${tuile('Résultat', F(s.entrees - s.sorties))}${tuile('Trésorerie fin', F(s.soldeFin))}</div>
${tableau(
  ['Date', 'Catégorie', 'Description', 'Chambre', ['Recette', 'num'], ['Dépense', 'num']],
  l.mouvements.map((m) => [
    formatDate(m.date),
    e(m.categorie),
    e(m.description || '—'),
    e(m.chambre ?? '—'),
    m.sens === 'entree' ? F(m.montant) : '',
    m.sens === 'sortie' ? F(m.montant) : '',
  ]),
  ['<b>Total</b>', '', '', '', `<b>${F(s.entrees)}</b>`, `<b>${F(s.sorties)}</b>`]
)}
<div class="pied">Livre établi avec Onílé — Gérer aujourd’hui, habiter demain.</div>
</section>
</body></html>`;
}

/** Même contenu, une feuille par partie : filtrable et triable dans Excel. */
export function xlsxLivre(l: LivreDeTenue): Uint8Array {
  const s = l.synthese;
  const entete = (t: string) => [`${t} — ${l.maison}`, `${l.periode.libelle} : du ${formatDate(l.periode.debut)} au ${formatDate(l.periode.fin)} · ${l.proprietaire.nom}`];
  const feuilles: Feuille[] = [
    {
      nom: 'Synthèse',
      entete: entete('Livre de tenue'),
      colonnes: [{ titre: 'Indicateur', largeur: 30 }, { titre: 'Valeur', type: 'montant', largeur: 18 }],
      lignes: [
        ['Chambres', s.chambres],
        ['Chambres occupées', s.occupees],
        ['Locataires actifs', s.locatairesActifs],
        ['Loyers attendus (échéances passées)', s.loyersAttendus],
        ['Loyers encaissés', s.loyersEncaisses],
        ['Taux de recouvrement (%)', s.tauxRecouvrement],
        ['Impayés aujourd’hui', s.impayesAujourdhui],
        ['Électricité vendue', s.electriciteMontant],
        ['Électricité vendue (kWh)', s.electriciteKwh],
        ['Recettes', s.entrees],
        ['Dépenses', s.sorties],
        ['Trésorerie au début', s.soldeDebut],
        ['Trésorerie à la fin', s.soldeFin],
      ],
    },
    {
      nom: 'Par mois',
      entete: entete('Loyers et dépenses par mois'),
      colonnes: [{ titre: 'Mois' }, { titre: 'Attendu', type: 'montant' }, { titre: 'Encaissé', type: 'montant' }, { titre: 'Écart', type: 'montant' }, { titre: 'Dépenses', type: 'montant' }],
      lignes: l.parMois.map((m) => [moisCourt(m.annee, m.mois), m.attendu, m.encaisse, m.encaisse - m.attendu, m.depenses]),
      total: [
        'Total',
        l.parMois.reduce((t, m) => t + m.attendu, 0),
        l.parMois.reduce((t, m) => t + m.encaisse, 0),
        l.parMois.reduce((t, m) => t + m.encaisse - m.attendu, 0),
        l.parMois.reduce((t, m) => t + m.depenses, 0),
      ],
    },
    {
      nom: 'Chambres',
      entete: entete('Vue d’ensemble des chambres'),
      colonnes: [
        { titre: 'Chambre' },
        { titre: 'Type' },
        { titre: 'Occupant actuel', largeur: 24 },
        { titre: 'Loyer', type: 'montant' },
        { titre: 'Dû', type: 'montant' },
        { titre: 'Payé', type: 'montant' },
        { titre: 'Impayé', type: 'montant' },
        { titre: 'Situation' },
      ],
      lignes: l.chambres.map((c) => [
        c.reference,
        c.type,
        c.occupants.find((o) => o.statut === 'actif')?.nom ?? '',
        c.loyer_indicatif,
        c.totalDu,
        c.totalPaye,
        c.impaye,
        SITUATION[c.situation][0],
      ]),
      total: ['Total', '', '', null, l.chambres.reduce((t, c) => t + c.totalDu, 0), l.chambres.reduce((t, c) => t + c.totalPaye, 0), l.chambres.reduce((t, c) => t + c.impaye, 0), ''],
    },
    {
      nom: 'Occupants',
      entete: entete('Occupants de chaque chambre'),
      colonnes: [
        { titre: 'Chambre' },
        { titre: 'Locataire', largeur: 24 },
        { titre: 'Téléphone' },
        { titre: 'Entrée', type: 'date' },
        { titre: 'Sortie', type: 'date' },
        { titre: 'Loyer', type: 'montant' },
        { titre: 'Caution', type: 'montant' },
        { titre: 'Statut' },
      ],
      lignes: l.chambres.flatMap((c) =>
        c.occupants.map((o) => [c.reference, o.nom, o.telephone, o.date_debut, o.date_sortie, o.loyer, o.caution, o.statut === 'actif' ? 'Actuel' : 'Parti'])
      ),
    },
    {
      nom: 'Échéancier',
      entete: entete('Échéancier des loyers, chambre par chambre'),
      colonnes: [
        { titre: 'Chambre' },
        { titre: 'Locataire', largeur: 24 },
        { titre: 'Mois' },
        { titre: 'Échéance', type: 'date' },
        { titre: 'Dû', type: 'montant' },
        { titre: 'Payé', type: 'montant' },
        { titre: 'Reste', type: 'montant' },
        { titre: 'Statut' },
      ],
      lignes: l.chambres.flatMap((c) => c.echeances.map((x) => [c.reference, x.locataire, moisCourt(x.annee, x.mois), x.date_echeance, x.du, x.paye, x.reste, x.statut])),
      total: [
        'Total',
        '',
        '',
        null,
        l.chambres.reduce((t, c) => t + c.totalDu, 0),
        l.chambres.reduce((t, c) => t + c.totalPaye, 0),
        l.chambres.reduce((t, c) => t + c.impaye, 0),
        '',
      ],
    },
    {
      nom: 'Paiements',
      entete: entete('Journal des paiements'),
      colonnes: [
        { titre: 'Date', type: 'date' },
        { titre: 'Chambre' },
        { titre: 'Locataire', largeur: 24 },
        { titre: 'Mode' },
        { titre: 'Référence' },
        { titre: 'Mois réglés', largeur: 28 },
        { titre: 'Montant', type: 'montant' },
      ],
      lignes: l.paiements.map((x) => [x.date, x.chambre, x.locataire, x.mode, x.reference, x.periodes.map((m) => moisCourt(m.annee, m.mois)).join(', ') || 'Crédit', x.montant]),
      total: ['Total', '', '', '', '', `${l.paiements.length} paiement(s)`, l.paiements.reduce((t, x) => t + x.montant, 0)],
    },
    {
      nom: 'Irrégularités',
      entete: entete('Situations irrégulières à ce jour'),
      colonnes: [{ titre: 'Chambre' }, { titre: 'Locataire / client', largeur: 24 }, { titre: 'Nature', largeur: 30 }, { titre: 'Détail', largeur: 22 }, { titre: 'Montant dû', type: 'montant' }],
      lignes: l.irregularites.map((i) => [i.chambre, i.locataire, i.nature, i.detail, i.montant]),
      total: ['Total', '', '', '', l.irregularites.reduce((t, i) => t + i.montant, 0)],
    },
    {
      nom: 'Électricité',
      entete: entete('Ventes d’électricité'),
      colonnes: [
        { titre: 'Date', type: 'date' },
        { titre: 'Chambre / compteur' },
        { titre: 'Client', largeur: 24 },
        { titre: 'Mode' },
        { titre: 'kWh', type: 'nombre' },
        { titre: 'Montant', type: 'montant' },
      ],
      lignes: l.electricite.map((a) => [a.date, a.chambre, a.client, a.mode, a.kwh, a.montant]),
      total: ['Total', '', '', '', s.electriciteKwh, s.electriciteMontant],
    },
    {
      nom: 'Recettes et dépenses',
      entete: entete('Recettes et dépenses'),
      colonnes: [
        { titre: 'Date', type: 'date' },
        { titre: 'Catégorie', largeur: 22 },
        { titre: 'Description', largeur: 34 },
        { titre: 'Chambre' },
        { titre: 'Mode' },
        { titre: 'Recette', type: 'montant' },
        { titre: 'Dépense', type: 'montant' },
      ],
      lignes: l.mouvements.map((m) => [m.date, m.categorie, m.description, m.chambre, m.mode, m.sens === 'entree' ? m.montant : null, m.sens === 'sortie' ? m.montant : null]),
      total: ['Total', '', '', '', '', s.entrees, s.sorties],
    },
  ];
  return classeurXlsx(feuilles, `Livre de tenue — ${l.maison}`);
}
