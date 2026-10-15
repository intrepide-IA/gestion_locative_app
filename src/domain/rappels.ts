/**
 * Rappels à programmer (cahier des charges, section 13), calculés à partir des données — sans module natif.
 * Chaque rappel a une clé unique : un même événement ne produit jamais deux notifications.
 */
import { formatFCFA } from './format';
import { LIBELLES_STOCK, type EtatStock } from './electricite';

export interface RappelSouhaite {
  cle: string;
  type: 'loyer' | 'fin_contrat' | 'electricite' | 'sauvegarde';
  titre: string;
  corps: string;
  date: Date;
}

export interface DonneesRappels {
  echeancesImpayees: { id: number; date_echeance: string; reste: number; locataire_nom: string; logement_reference: string }[];
  contratsAvecFin: { id: number; date_fin: string; locataire_nom: string; logement_reference: string }[];
  stocks: { contrat_id: number; etat: EtatStock; stock: number; locataire_nom: string; achetes: number; consommes: number }[];
}

/** Date locale à 9 h (ou `heure`) pour un jour AAAA-MM-JJ décalé de `jours`. */
export function aHeure(jour: string, jours = 0, heure = 9): Date {
  const [a, m, j] = jour.split('-').map(Number);
  return new Date(a, m - 1, j + jours, heure, 0, 0, 0);
}

export function rappelsSouhaites(d: DonneesRappels, maintenant: Date): RappelSouhaite[] {
  const rappels: RappelSouhaite[] = [];
  const futur = (r: RappelSouhaite) => r.date.getTime() > maintenant.getTime() && rappels.push(r);

  for (const e of d.echeancesImpayees) {
    const quoi = `${e.locataire_nom} (${e.logement_reference}) : ${formatFCFA(e.reste)}`;
    futur({ cle: `loyer-${e.id}-j-3`, type: 'loyer', titre: 'Loyer dans 3 jours', corps: quoi, date: aHeure(e.date_echeance, -3) });
    futur({ cle: `loyer-${e.id}-j`, type: 'loyer', titre: 'Loyer à payer aujourd’hui', corps: quoi, date: aHeure(e.date_echeance) });
    futur({ cle: `loyer-${e.id}-j+3`, type: 'loyer', titre: 'Loyer en retard', corps: `${quoi} — échéance dépassée de 3 jours`, date: aHeure(e.date_echeance, 3) });
  }

  for (const c of d.contratsAvecFin) {
    futur({
      cle: `fin-${c.id}-${c.date_fin}`,
      type: 'fin_contrat',
      titre: 'Fin de contrat dans 7 jours',
      corps: `${c.locataire_nom} (${c.logement_reference})`,
      date: aHeure(c.date_fin, -7),
    });
  }

  // Alerte immédiate, une seule fois par situation (nouvelle vente ou nouveau relevé = nouvelle situation).
  for (const s of d.stocks) {
    // Pas d'alerte pour un locataire qui n'a encore jamais acheté d'électricité prépayée.
    if (s.etat === 'ok' || s.achetes === 0) continue;
    rappels.push({
      cle: `kwh-${s.contrat_id}-${s.etat}-${s.achetes}-${s.consommes}`,
      type: 'electricite',
      titre: `Électricité : ${LIBELLES_STOCK[s.etat].toLowerCase()}`,
      corps: `${s.locataire_nom} : ${String(s.stock).replace('.', ',')} kWh`,
      date: new Date(maintenant.getTime() + 5000),
    });
  }

  const moisSuivant = new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 1, 10, 0, 0, 0);
  rappels.push({
    cle: `sauvegarde-${moisSuivant.getFullYear()}-${String(moisSuivant.getMonth() + 1).padStart(2, '0')}`,
    type: 'sauvegarde',
    titre: 'Pensez à sauvegarder vos données',
    corps: 'Plus → Sauvegarde : exportez une copie et gardez-la hors du téléphone.',
    date: moisSuivant,
  });

  return rappels;
}
