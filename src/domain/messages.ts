/**
 * Messages WhatsApp qui accompagnent chaque document envoyé au locataire (ou au client électricité).
 * Écrits comme un propriétaire les écrirait lui-même : simples, polis, chaleureux, sans formules
 * administratives. Le propriétaire peut toujours les modifier avant l'envoi.
 */
import type { AvisElectricite } from './electricite';
import { aujourdhui as jourActuel, formatDate, formatFCFA, formatMois } from './format';

/** Montant lisible dans WhatsApp (espaces simples plutôt que fines). */
const fcfa = (n: number) => formatFCFA(n).replace(/ /g, ' ');
const kwh = (n: number) => `${String(n).replace('.', ',')} kWh`;
const index = (n: number) => String(n).replace('.', ',');
const bonjour = (nom: string) => `Bonjour ${nom.trim().replace(/\s+/g, ' ')},`;

/** Assemble les lignes : un saut de ligne entre chaque, la signature à la fin. */
function message(lignes: (string | false | null | undefined)[], proprietaire: string): string {
  const corps = lignes.filter((l): l is string => !!l);
  return [...corps, '', proprietaire.trim()].join('\n').trim();
}

/** Nombre de jours entre deux dates AAAA-MM-JJ. */
function joursEntre(de: string, a: string): number {
  const t = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  return Math.round((t(a.slice(0, 10)) - t(de.slice(0, 10))) / 86_400_000);
}

/** « aujourd'hui », « demain », « d'ici 3 jours ». */
function delai(jours: number): string {
  if (jours <= 0) return 'aujourd’hui';
  if (jours === 1) return 'demain';
  return `d’ici ${jours} jours`;
}

const listeMois = (mois: { annee: number; mois: number }[]) => mois.map((m) => formatMois(m.mois, m.annee)).join(', ');

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
  return message(
    [
      bonjour(d.nom),
      `Merci, j’ai bien reçu vos ${fcfa(d.montant)}${d.mois.length ? ` pour le loyer de ${listeMois(d.mois)}` : ''}.`,
      d.avance && d.avance > 0 ? `${fcfa(d.avance)} sont gardés en avance pour les prochains mois.` : '',
      d.soldeRestant > 0 ? `Il reste encore ${fcfa(d.soldeRestant)} à régler, quand vous pourrez.` : 'Vous êtes à jour, merci beaucoup.',
      `Je vous envoie votre reçu (n° ${d.numero}). Bonne journée !`,
    ],
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
  /** Pour savoir si l'échéance est déjà passée (relance). */
  aujourdhui?: string;
}): string {
  const jour = d.aujourdhui ?? jourActuel();
  const mois = formatMois(d.periode.mois, d.periode.annee);
  if (d.reste <= 0) {
    return message(
      [bonjour(d.nom), `Voici la facture du loyer de ${mois}. Elle est déjà réglée, merci beaucoup pour votre sérieux.`, 'Bonne journée !'],
      d.proprietaire
    );
  }
  if (d.dateEcheance < jour) {
    return message(
      [
        bonjour(d.nom),
        `Petit rappel : le loyer de ${mois} (${fcfa(d.reste)}) était attendu le ${formatDate(d.dateEcheance)} et je n’ai encore rien reçu.`,
        'Je vous renvoie la facture. Merci de passer régler dès que possible, ou de me faire signe si vous avez un souci.',
        'Bonne journée.',
      ],
      d.proprietaire
    );
  }
  return message(
    [
      bonjour(d.nom),
      `J’espère que vous allez bien. Je vous envoie la facture du loyer de ${mois} : ${fcfa(d.reste)}.`,
      `La prochaine échéance est le ${formatDate(d.dateEcheance)}.`,
      'Merci pour votre fidélité, et passez une bonne journée !',
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
  return message(
    [
      bonjour(d.nom),
      `Votre recharge d’électricité est bien enregistrée : ${kwh(d.kwh)} pour ${fcfa(d.montant)}.`,
      d.indexCoupure !== null ? `Le courant tiendra jusqu’à ce que le compteur affiche ${index(d.indexCoupure)}.` : '',
      'Je vous envoie la facture. Merci et bonne journée !',
    ],
    d.proprietaire
  );
}

export function messageAvisElectricite(a: AvisElectricite, nom: string, proprietaire: string, aujourdhui = jourActuel()): string {
  if (a.cas === 'depasse') {
    return message(
      [
        bonjour(nom),
        `Je vous informe que vous avez dépassé votre crédit d’électricité : il finissait à l’index ${index(a.indexCoupure)} et le compteur affiche maintenant ${index(
          a.indexActuel
        )}.`,
        `Ça fait ${kwh(a.depasseKwh)} consommés en plus, soit ${fcfa(a.montantDu)}.`,
        `Merci de régler ça avant le ${formatDate(a.dateLimite!)}, pour qu’on ne soit pas obligé de couper le courant.`,
        'Je vous envoie le détail. Bonne journée.',
      ],
      proprietaire
    );
  }
  if (a.cas === 'epuise') {
    return message(
      [
        bonjour(nom),
        `Votre crédit d’électricité est terminé : le compteur est arrivé à ${index(a.indexCoupure)}.`,
        `Pensez à recharger avant le ${formatDate(a.dateLimite!)}, sinon le courant sera coupé.`,
        'Merci et bonne journée.',
      ],
      proprietaire
    );
  }
  const jours = a.epuisementEstime ? joursEntre(aujourdhui, a.epuisementEstime) : null;
  if (a.cas === 'bientot') {
    return message(
      [
        bonjour(nom),
        `Il vous reste à peu près ${kwh(a.resteKwh)} d’électricité${jours !== null ? `, ça peut finir ${delai(jours)}` : ''}.`,
        `Le courant s’arrêtera quand le compteur affichera ${index(a.indexCoupure)}.`,
        'Pensez à recharger à temps pour ne pas être coupé. Merci et bonne journée !',
      ],
      proprietaire
    );
  }
  return message(
    [
      bonjour(nom),
      `Petit point sur votre électricité : le compteur affiche ${index(a.indexActuel)} et votre crédit va jusqu’à ${index(a.indexCoupure)}.`,
      `Il vous reste ${kwh(a.resteKwh)}${a.epuisementEstime ? `, à peu près jusqu’au ${formatDate(a.epuisementEstime)}` : ''}.`,
      'Bonne journée !',
    ],
    proprietaire
  );
}

export function messageContrat(d: { nom: string; logement: string; signe: boolean; proprietaire: string }): string {
  return message(
    d.signe
      ? [
          bonjour(d.nom),
          `Voici votre contrat de location pour ${d.logement}, signé par nous deux.`,
          'Gardez-le bien, il vous servira en cas de besoin. Encore bienvenue chez nous et bonne journée !',
        ]
      : [
          bonjour(d.nom),
          `Je vous envoie le contrat de location pour ${d.logement}.`,
          'Prenez le temps de le lire, et dites-moi si vous avez des questions avant qu’on le signe. Bonne journée !',
        ],
    d.proprietaire
  );
}

export function messageEtatDesLieux(d: { nom: string; logement: string; type: 'entree' | 'sortie' | 'les deux'; proprietaire: string }): string {
  const quoi = d.type === 'entree' ? 'l’état des lieux d’entrée' : d.type === 'sortie' ? 'l’état des lieux de sortie' : 'les états des lieux';
  return message(
    [
      bonjour(d.nom),
      `Je vous envoie ${quoi} de ${d.logement}.`,
      'Regardez-le tranquillement et dites-moi si quelque chose ne vous semble pas juste. Bonne journée !',
    ],
    d.proprietaire
  );
}
