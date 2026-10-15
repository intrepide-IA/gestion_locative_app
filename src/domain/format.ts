/** Formats d'affichage en français, sans dépendre d'Intl (indisponible ou partiel selon les moteurs JS). */

const ESPACE_FINE = ' ';

/** 1250000 → « 1 250 000 FCFA » (espaces fines insécables). */
export function formatFCFA(montant: number): string {
  const signe = montant < 0 ? '−' : '';
  const chiffres = Math.round(Math.abs(montant)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE_FINE);
  return `${signe}${chiffres}${ESPACE_FINE}FCFA`;
}

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « 2026-10-01 » → « 1 oct. 2026 ». Accepte aussi une date ISO complète. */
export function formatDate(iso: string): string {
  const [annee, mois, jour] = iso.slice(0, 10).split('-').map(Number);
  if (!annee || !mois || !jour) return iso;
  return `${jour} ${MOIS_COURTS[mois - 1]} ${annee}`;
}

/** (10, 2026) → « octobre 2026 ». */
export function formatMois(mois: number, annee: number): string {
  return `${MOIS[mois - 1]} ${annee}`;
}

/** Date locale du jour au format AAAA-MM-JJ (pas d'UTC : évite le décalage d'un jour). */
export function aujourdhui(date: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** Horodatage ISO (UTC) → heure locale « 14:05 ». */
export function formatHeure(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Horodatage ISO (UTC) → « 15 oct. 2026 à 14:05 » en heure locale. */
export function formatDateHeure(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return formatDate(iso);
  return `${formatDate(aujourdhui(d))} à ${formatHeure(iso)}`;
}

/** « Moussa Adéyèmi » → « MA ». */
export function initiales(nom: string): string {
  return nom
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase() ?? '')
    .join('');
}

/** Lit un montant saisi (« 25 000 », « 25000 ») ; null si invalide. Refuse les décimales et le texte. */
export function lireMontant(saisie: string): number | null {
  const nettoye = saisie.replace(/[\s  ]/g, '');
  if (!/^\d+$/.test(nettoye)) return null;
  const n = Number(nettoye);
  return Number.isSafeInteger(n) ? n : null;
}
