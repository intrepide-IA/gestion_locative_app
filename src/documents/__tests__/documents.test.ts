import { donneesContrat, htmlContrat } from '../contrat';
import { enregistrerClauses, getBail, signerBail } from '../../repositories/bauxRepository';
import { createMigratedDatabase } from '../../db/__tests__/nodeDatabase';
import { creerLogement } from '../../repositories/logementRepository';
import { entrerLocataire } from '../../repositories/locataireRepository';
import { annulerPaiement, emettreFactureLoyer, enregistrerPaiement, genererEcheances, listerEcheancesDuMois } from '../../repositories/loyerRepository';
import { enregistrerProprietaire } from '../../repositories/proprietaireRepository';
import { donneesFacture, donneesRecu } from '../donnees';
import { echapper, htmlFacture, htmlRecu } from '../gabarits';

async function scenario() {
  const db = await createMigratedDatabase();
  await enregistrerProprietaire(db, { nom: 'Moussa Adé', telephone: '+229 01 00 00 00', adresse: 'Cotonou' });
  const logementId = await creerLogement(db, { reference: 'Chambre 1', type: 'chambre_salon', loyer_indicatif: 25000, toilettes: 1000 });
  const { locataireId } = await entrerLocataire(db, { nom_complet: 'Awa <script>alert(1)</script>' }, logementId, {
    date_debut: '2026-09-05',
    loyer: 25000,
    toilettes: 1000,
    caution: 0,
    prix_kwh: 250,
    releve_initial: 0,
    jour_echeance: 5,
  });
  await genererEcheances(db, '2026-10-01');
  const paiement = await enregistrerPaiement(db, { locataireId, montant: 15000, mode: 'mobile_money', datePaiement: '2026-10-03' });
  return { db, paiement };
}

test('échappement HTML', () => {
  expect(echapper(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('reçu : montant réellement reçu, reste à payer, textes échappés', async () => {
  const { db, paiement } = await scenario();
  const d = await donneesRecu(db, paiement.paiementId);
  expect(d).toMatchObject({ numero: 'REC-2026-00001', montant: 15000, mode: 'Mobile Money', soldeRestant: 11000, credit: 0 });
  const html = htmlRecu(d);
  expect(html).toContain('REC-2026-00001');
  expect(html).toContain('Loyer Octobre 2026');
  expect(html).toContain('15 000 FCFA');
  expect(html).toContain('11 000 FCFA');
  expect(html).not.toContain('<script>');
  expect(html).toContain('Awa &lt;script&gt;');
});

test('reçu d’un paiement annulé : marqué ANNULÉ avec le motif', async () => {
  const { db, paiement } = await scenario();
  await annulerPaiement(db, paiement.paiementId, 'Erreur de saisie');
  const html = htmlRecu(await donneesRecu(db, paiement.paiementId));
  expect(html).toContain('ANNULÉ');
  expect(html).toContain('Erreur de saisie');
});

test('facture : montant dû (pas le montant versé), déjà réglé et reste', async () => {
  const { db } = await scenario();
  const [echeance] = await listerEcheancesDuMois(db, 2026, 10, '2026-10-03');
  const numero = await emettreFactureLoyer(db, echeance.id);
  const d = await donneesFacture(db, numero);
  expect(d).toMatchObject({ montant: 26000, regle: 15000, loyer: 25000, toilettes: 1000 });
  const html = htmlFacture(d);
  expect(html).toContain('26 000 FCFA');
  expect(html).toContain('Partiellement réglée');
});

test('contrat de bail : clauses remplies, premier loyer le mois suivant, textes échappés', async () => {
  const db = await createMigratedDatabase();
  await enregistrerProprietaire(db, { nom: 'Moussa <b>', telephone: '+229 01', adresse: 'Akpakpa, Cotonou' });
  const logementId = await creerLogement(db, { reference: 'Chambre 1', type: 'chambre_salon', loyer_indicatif: 25000, toilettes: 1000 });
  const { contratId } = await entrerLocataire(db, { nom_complet: 'Awa' }, logementId, {
    date_debut: '2026-10-15', loyer: 25000, toilettes: 1000, caution: 75000, prix_kwh: 250, releve_initial: 0, jour_echeance: 15,
  });
  await enregistrerClauses(db, contratId, { ...(await getBail(db, contratId)), duree_annees: 2 });
  await signerBail(db, contratId, 'locataire', 'data:image/svg+xml;base64,PHN2Zy8+', '2026-10-15');
  const html = htmlContrat(await donneesContrat(db, contratId));
  expect(html).toContain('Moussa &lt;b&gt;');
  expect(html).toContain('<b>2</b> année(s)');
  expect(html).toContain('premier loyer étant dû le <b>15 nov. 2026</b>');
  expect(html).toContain('soit 3 mois de loyer');
  expect(html).toContain('<b>3 mois</b> de loyer constitue');
  expect(html).toContain('src="data:image/svg+xml;base64,PHN2Zy8+"');
});
