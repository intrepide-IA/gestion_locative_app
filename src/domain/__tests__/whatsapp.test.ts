import { avisElectricite } from '../electricite';
import { messageAvisElectricite, messageContrat, messageEtatDesLieux, messageFactureLoyer, messageRecu } from '../messages';
import { lienWhatsApp, numeroWhatsApp } from '../whatsapp';

describe('numéro WhatsApp', () => {
  test('numéro béninois à 10 chiffres, avec ou sans espaces', () => {
    expect(numeroWhatsApp('01 56 78 40 63')).toBe('2290156784063');
    expect(numeroWhatsApp('0199997031')).toBe('2290199997031');
  });

  test('ancien numéro à 8 chiffres : préfixe 01 ajouté', () => {
    expect(numeroWhatsApp('56 78 40 63')).toBe('2290156784063');
  });

  test('indicatif déjà présent (+229, 00229, 229…)', () => {
    expect(numeroWhatsApp('+229 01 56 78 40 63')).toBe('2290156784063');
    expect(numeroWhatsApp('00229 0156784063')).toBe('2290156784063');
    expect(numeroWhatsApp('2290156784063')).toBe('2290156784063');
  });

  test('numéro étranger avec + conservé', () => {
    expect(numeroWhatsApp('+33 6 12 34 56 78')).toBe('33612345678');
  });

  test('numéro vide ou trop court : null', () => {
    expect(numeroWhatsApp('')).toBeNull();
    expect(numeroWhatsApp(null)).toBeNull();
    expect(numeroWhatsApp('12 34')).toBeNull();
    expect(lienWhatsApp('12')).toBeNull();
  });

  test('lien wa.me avec message encodé', () => {
    expect(lienWhatsApp('0156784063', 'Bonjour & merci')).toBe('https://wa.me/2290156784063?text=Bonjour%20%26%20merci');
    expect(lienWhatsApp('0156784063')).toBe('https://wa.me/2290156784063');
  });
});

describe('messages rédigés', () => {
  test('reçu : remerciement, mois réglés, situation et signature', () => {
    const m = messageRecu({
      nom: 'Awa Koffi',
      numero: 'REC-2026-00003',
      date: '2026-10-05',
      montant: 25000,
      mois: [{ annee: 2026, mois: 10 }],
      soldeRestant: 0,
      proprietaire: 'Imdad Adenon',
    });
    expect(m).toBe(
      'Bonjour Awa Koffi,\nMerci, j’ai bien reçu vos 25 000 FCFA pour le loyer de octobre 2026.\nVous êtes à jour, merci beaucoup.\nJe vous envoie votre reçu (n° REC-2026-00003). Bonne journée !\n\nImdad Adenon'
    );
  });

  const facture = { nom: 'Awa', numero: 'FAC-2026-00001', periode: { annee: 2026, mois: 11 }, dateEcheance: '2026-11-05', proprietaire: 'Imdad' };

  test('facture de loyer à venir : montant, échéance, remerciement', () => {
    const m = messageFactureLoyer({ ...facture, reste: 25000, aujourdhui: '2026-10-28' });
    expect(m).toContain('la facture du loyer de novembre 2026 : 25 000 FCFA.');
    expect(m).toContain('La prochaine échéance est le 5 nov. 2026.');
    expect(m).toContain('Merci pour votre fidélité');
  });

  test('facture de loyer en retard : relance polie', () => {
    const m = messageFactureLoyer({ ...facture, reste: 25000, aujourdhui: '2026-11-10' });
    expect(m).toContain('Petit rappel : le loyer de novembre 2026 (25 000 FCFA) était attendu le 5 nov. 2026');
  });

  test('facture déjà réglée', () => {
    expect(messageFactureLoyer({ ...facture, reste: 0 })).toContain('Elle est déjà réglée');
  });

  test('contrat signé ou à lire, état des lieux', () => {
    expect(messageContrat({ nom: 'Awa', logement: 'Chambre 1', signe: true, proprietaire: 'Imdad' })).toContain(
      'Voici votre contrat de location pour Chambre 1, signé par nous deux.'
    );
    expect(messageContrat({ nom: 'Awa', logement: 'Chambre 1', signe: false, proprietaire: 'Imdad' })).toContain('Prenez le temps de le lire');
    expect(messageEtatDesLieux({ nom: 'Awa', logement: 'Chambre 1', type: 'sortie', proprietaire: 'Imdad' })).toContain(
      'Je vous envoie l’état des lieux de sortie de Chambre 1.'
    );
  });
});

describe('avis d’électricité', () => {
  const base = { dernier_index: 1030, prix_kwh: 250, epuisement_estime: null };

  test('dépassement : kWh consommés sans crédit, montant et date limite', () => {
    const a = avisElectricite({ ...base, stock: -6.4, index_coupure: 1023.6 }, 5, '2026-10-30');
    expect(a).toMatchObject({ cas: 'depasse', depasseKwh: 6.4, montantDu: 1600, resteKwh: 0, dateLimite: '2026-10-30', indexCoupure: 1023.6 });
    const m = messageAvisElectricite(a, 'Awa', 'Imdad');
    expect(m).toContain('Ça fait 6,4 kWh consommés en plus, soit 1 600 FCFA.');
    expect(m).toContain('Merci de régler ça avant le 30 oct. 2026');
  });

  test('montant arrondi au franc supérieur', () => {
    expect(avisElectricite({ ...base, stock: -0.3, index_coupure: 1029.7, prix_kwh: 245 }, 5, '2026-10-30').montantDu).toBe(74);
  });

  test('crédit épuisé : recharger avant la date', () => {
    const a = avisElectricite({ ...base, stock: 0, index_coupure: 1030 }, 5, '2026-10-30');
    expect(a).toMatchObject({ cas: 'epuise', montantDu: 0, dateLimite: '2026-10-30' });
  });

  test('crédit en cours ou bientôt épuisé : index de coupure, sans date limite', () => {
    const bientot = avisElectricite({ ...base, stock: 3, index_coupure: 1033, epuisement_estime: '2026-11-01' }, 5, '2026-10-30');
    expect(bientot).toMatchObject({ cas: 'bientot', resteKwh: 3, dateLimite: null, epuisementEstime: '2026-11-01' });
    expect(messageAvisElectricite(bientot, 'Awa', 'Imdad', '2026-10-30')).toContain('Il vous reste à peu près 3 kWh d’électricité, ça peut finir d’ici 2 jours.');
    expect(messageAvisElectricite({ ...bientot, epuisementEstime: '2026-10-31' }, 'Awa', 'Imdad', '2026-10-30')).toContain('ça peut finir demain');
    expect(avisElectricite({ ...base, stock: 40, index_coupure: 1070 }, 5, '2026-10-30').cas).toBe('credit');
  });
});
