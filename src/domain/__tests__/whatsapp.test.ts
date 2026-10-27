import { avisElectricite } from '../electricite';
import { messageAvisElectricite, messageFactureLoyer, messageRecu } from '../messages';
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
  test('reçu : montant, mois réglés, reste et signature', () => {
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
      'Bonjour Awa Koffi,\nJ’ai bien reçu votre paiement de 25 000 FCFA du 5 oct. 2026 (loyer octobre 2026). Merci.\nVous êtes à jour.\nJe vous envoie le reçu n° REC-2026-00003.\n\nImdad Adenon'
    );
  });

  test('facture de loyer à régler', () => {
    const m = messageFactureLoyer({
      nom: 'Awa',
      numero: 'FAC-2026-00001',
      periode: { annee: 2026, mois: 11 },
      dateEcheance: '2026-11-05',
      reste: 25000,
      proprietaire: 'Imdad',
    });
    expect(m).toContain('loyer de novembre 2026 : 25 000 FCFA à régler avant le 5 nov. 2026');
  });
});

describe('avis d’électricité', () => {
  const base = { dernier_index: 1030, prix_kwh: 250, epuisement_estime: null };

  test('dépassement : kWh consommés sans crédit, montant et date limite', () => {
    const a = avisElectricite({ ...base, stock: -6.4, index_coupure: 1023.6 }, 5, '2026-10-30');
    expect(a).toMatchObject({ cas: 'depasse', depasseKwh: 6.4, montantDu: 1600, resteKwh: 0, dateLimite: '2026-10-30', indexCoupure: 1023.6 });
    const m = messageAvisElectricite(a, 'Awa', 'Imdad');
    expect(m).toContain('consommé 6,4 kWh sans crédit, soit 1 600 FCFA');
    expect(m).toContain('avant le 30 oct. 2026, sinon le courant sera coupé');
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
    expect(messageAvisElectricite(bientot, 'Awa', 'Imdad')).toContain('il vous reste 3 kWh, à peu près jusqu’au 1 nov. 2026');
    expect(avisElectricite({ ...base, stock: 40, index_coupure: 1070 }, 5, '2026-10-30').cas).toBe('credit');
  });
});
