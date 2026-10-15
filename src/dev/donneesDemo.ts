/**
 * Jeu de données de démonstration (captures de la landing page, essais). Utilisé uniquement par l'aperçu
 * web de développement : jamais appelé dans l'application Android.
 */
import type { SqlDatabase } from '../db/types';
import { aujourdhui } from '../domain/format';
import { acheterElectricite, enregistrerReleve } from '../repositories/electriciteRepository';
import { creerMouvement, definirSoldeInitial, listerCategories } from '../repositories/financesRepository';
import { creerLogement } from '../repositories/logementRepository';
import { entrerLocataire } from '../repositories/locataireRepository';
import { enregistrerPaiement, genererEcheances } from '../repositories/loyerRepository';
import { enregistrerProprietaire } from '../repositories/proprietaireRepository';

const decaler = (jours: number) => {
  const d = new Date();
  d.setDate(d.getDate() + jours);
  return aujourdhui(d);
};

/** Premier jour du mois, `mois` mois avant le mois courant. */
const debutMois = (mois: number) => {
  const d = new Date();
  return aujourdhui(new Date(d.getFullYear(), d.getMonth() - mois, 1));
};

export async function chargerDonneesDemo(db: SqlDatabase): Promise<void> {
  await enregistrerProprietaire(db, { nom: 'Moussa Adéyèmi', telephone: '+229 01 97 00 00 00', adresse: 'Akpakpa, Cotonou' });
  await definirSoldeInitial(db, 150000);

  const logements = [
    { reference: 'Chambre 1', type: 'entree_couchee' as const, loyer: 25000, toilettes: 1000 },
    { reference: 'Chambre 2', type: 'entree_couchee' as const, loyer: 25000, toilettes: 1000 },
    { reference: 'Appartement A', type: 'chambre_salon' as const, loyer: 45000, toilettes: 1000 },
    { reference: 'Appartement B', type: 'chambre_salon' as const, loyer: 45000, toilettes: 1000 },
    { reference: 'Studio', type: 'autre' as const, loyer: 35000, toilettes: 0 },
  ];
  const ids: number[] = [];
  for (const l of logements) {
    ids.push(await creerLogement(db, { reference: l.reference, type: l.type, loyer_indicatif: l.loyer, toilettes: l.toilettes }));
  }

  const locataires = [
    { nom: 'Awa Houngbo', tel: '+229 01 61 00 00 01', logement: 2, depuis: 3, releve: 1200 },
    { nom: 'Koffi Mensah', tel: '+229 01 62 00 00 02', logement: 0, depuis: 3, releve: 800 },
    { nom: 'Rachidatou Bio', tel: '+229 01 63 00 00 03', logement: 3, depuis: 2, releve: 450 },
    { nom: 'Jean-Baptiste Agossou', tel: '+229 01 64 00 00 04', logement: 1, depuis: 1, releve: 300 },
  ];
  const contrats: { locataireId: number; contratId: number }[] = [];
  for (const t of locataires) {
    const l = logements[t.logement];
    contrats.push(
      await entrerLocataire(db, { nom_complet: t.nom, telephone: t.tel }, ids[t.logement], {
        date_debut: debutMois(t.depuis),
        loyer: l.loyer,
        toilettes: l.toilettes,
        caution: l.loyer * 2,
        prix_kwh: 250,
        releve_initial: t.releve,
        jour_echeance: 5,
      })
    );
  }

  await genererEcheances(db, aujourdhui());
  const payer = (i: number, montant: number, jours: number, mode: 'especes' | 'mobile_money' = 'mobile_money') =>
    enregistrerPaiement(db, { locataireId: contrats[i].locataireId, montant, mode, datePaiement: decaler(jours) });
  // Awa : à jour ; Koffi : partiel ce mois-ci ; Rachidatou : en retard ce mois-ci ; Jean-Baptiste : à jour.
  await payer(0, 46000 * 3, -45);
  await payer(0, 46000, -11);
  await payer(1, 26000 * 3, -40, 'especes');
  await payer(1, 15000, -3, 'especes');
  await payer(2, 46000 * 2, -33);
  await payer(3, 26000, -38);
  await payer(3, 26000, -9);

  const vendre = (i: number, montant: number, jours: number) =>
    acheterElectricite(db, { contratId: contrats[i].contratId, montantRecu: montant, mode: 'mobile_money', date: decaler(jours) });
  await vendre(0, 10000, -20);
  await vendre(1, 5000, -15);
  await vendre(2, 3000, -12);
  await enregistrerReleve(db, { contratId: contrats[0].contratId, nouvelIndex: 1230, date: decaler(-2) });
  await enregistrerReleve(db, { contratId: contrats[1].contratId, nouvelIndex: 817, date: decaler(-2) });
  await enregistrerReleve(db, { contratId: contrats[2].contratId, nouvelIndex: 461, date: decaler(-2) });

  const sorties = await listerCategories(db, 'sortie');
  const cat = (nom: string) => sorties.find((c) => c.nom === nom)!.id;
  await creerMouvement(db, { sens: 'sortie', date: decaler(-10), montant: 18000, categorieId: cat('Plomberie'), description: 'Réparation fuite douche', beneficiaire: 'Plombier Sèdjro' });
  await creerMouvement(db, { sens: 'sortie', date: decaler(-6), montant: 7500, categorieId: cat('Nettoyage'), description: 'Entretien de la cour' });
  await creerMouvement(db, { sens: 'sortie', date: decaler(12), montant: 40000, categorieId: cat('Réparations'), description: 'Peinture Chambre 2', brouillon: true });
}
